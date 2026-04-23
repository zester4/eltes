/**
 * lib/ai/tools/persistent-sandbox.ts
 *
 * AI-callable tools that give Etles a "home computer" — a persistent Linux
 * sandbox that survives across sessions, Vercel cold starts, and days of
 * inactivity. Unlike ephemeral Daytona sandboxes (which auto-delete after
 * 2 hours), this sandbox accumulates state: installed packages, built
 * projects, local databases, running services.
 *
 * The agent should reach for these tools when it needs to:
 *   - Build something that takes multiple sessions (a web app, a data pipeline)
 *   - Install a tool once and reuse it across conversations
 *   - Run a background service the user can access via URL
 *   - Keep a local "notebook" of scripts and results
 *
 * Usage pattern in route.ts:
 *   import * as psTools from "@/lib/ai/tools/persistent-sandbox";
 *   tools: {
 *     ...psTools.getPersistentSandboxTools({ userId }),
 *   }
 */

import { tool } from "ai";
import { z } from "zod";
import {
  getOrCreatePersistentSandbox,
  resetPersistentSandbox,
  getPersistentSandboxId,
} from "@/lib/persistent-sandbox/client";

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Wraps every tool execute() with a sandbox wake-up.
 * The sandbox is resumed (or created) transparently on every call.
 */
async function withSandbox<T>(
  userId: string,
  fn: (
    sandbox: Awaited<
      ReturnType<typeof getOrCreatePersistentSandbox>
    >["sandbox"]
  ) => Promise<T>
): Promise<T> {
  const { sandbox } = await getOrCreatePersistentSandbox(userId);
  return fn(sandbox);
}

// ── Tool factory ──────────────────────────────────────────────────────────────

export function getPersistentSandboxTools({ userId }: { userId: string }) {
  return {
    sandboxStatus: sandboxStatus({ userId }),
    sandboxRun: sandboxRun({ userId }),
    sandboxWriteFile: sandboxWriteFile({ userId }),
    sandboxReadFile: sandboxReadFile({ userId }),
    sandboxListFiles: sandboxListFiles({ userId }),
    sandboxInstall: sandboxInstall({ userId }),
    sandboxStartService: sandboxStartService({ userId }),
    sandboxReset: sandboxReset({ userId }),
  };
}

// ── Individual tools ──────────────────────────────────────────────────────────

/**
 * sandboxStatus — Check if the persistent sandbox exists and its state.
 */
const sandboxStatus = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Check the status of the user's persistent sandbox. Returns whether one exists, " +
      "its ID, and basic info. Use before performing sandbox operations to understand " +
      "the current state.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const sandboxId = await getPersistentSandboxId(userId);
        if (!sandboxId) {
          return {
            exists: false,
            message:
              "No persistent sandbox yet. It will be created automatically on first use.",
          };
        }
        return {
          exists: true,
          sandboxId,
          message:
            `Persistent sandbox ${sandboxId} exists. Use sandboxRun to wake it and ` +
            `execute commands. All previous files and installed packages are preserved.`,
        };
      } catch (error: any) {
        return { exists: false, error: error?.message };
      }
    },
  });

/**
 * sandboxRun — Execute a shell command in the persistent sandbox.
 * This is the primary tool — run anything: build, test, install, query, etc.
 */
const sandboxRun = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Execute a shell command inside the user's persistent sandbox. " +
      "The sandbox resumes from its previous state — all installed packages, " +
      "files, and environment variables are exactly as you left them. " +
      "Use for: running scripts, installing packages, building projects, " +
      "querying local databases, checking logs, or any shell operation. " +
      "The working directory persists between calls. " +
      "Example commands: 'ls ~/workspace', 'python3 script.py', " +
      "'npm run build', 'cat ~/projects/app/logs.txt'",
    inputSchema: z.object({
      command: z
        .string()
        .describe(
          "Shell command to execute. Runs as 'user' in the sandbox. " +
          "Use full paths or cd to the right directory first. " +
          "Example: 'cd ~/workspace && python3 analyze.py'"
        ),
      workingDir: z
        .string()
        .optional()
        .describe(
          "Working directory for the command. Defaults to /home/user. " +
          "Example: '/home/user/workspace/my-project'"
        ),
      timeoutSeconds: z
        .number()
        .min(5)
        .max(300)
        .optional()
        .default(60)
        .describe("Command timeout in seconds. Default 60. Max 300 (5 min)."),
    }),
    execute: async ({ command, workingDir, timeoutSeconds }) => {
      try {
        return await withSandbox(userId, async (sandbox) => {
          const result = await sandbox.commands.run(command, {
            cwd: workingDir,
            timeoutMs: (timeoutSeconds ?? 60) * 1000,
          });

          const stdout = result.stdout?.trim() ?? "";
          const stderr = result.stderr?.trim() ?? "";

          return {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: stdout.length > 8_000 ? stdout.slice(0, 8_000) + "\n[...truncated]" : stdout,
            stderr: stderr.length > 2_000 ? stderr.slice(0, 2_000) + "\n[...truncated]" : stderr,
            ...(result.exitCode !== 0 && {
              error: `Command exited with code ${result.exitCode}`,
            }),
          };
        });
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * sandboxWriteFile — Write a file into the persistent sandbox filesystem.
 * The file persists across sessions until explicitly deleted.
 */
const sandboxWriteFile = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Write a file to the user's persistent sandbox filesystem. " +
      "The file persists indefinitely across sessions — write it once, " +
      "run it from any conversation. Use for: scripts, config files, " +
      "data files, templates, or any content that needs to live on the sandbox. " +
      "Prefer ~/workspace/ for projects and ~/projects/ for long-lived code.",
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "Absolute path inside the sandbox. " +
          "Example: '/home/user/workspace/scraper.py' or '~/projects/app/config.json'"
        ),
      content: z.string().describe("Text content to write to the file."),
    }),
    execute: async ({ path, content }) => {
      try {
        return await withSandbox(userId, async (sandbox) => {
          // Expand ~ to /home/user
          const resolvedPath = path.replace(/^~/, "/home/user");

          // Ensure parent directory exists
          const dir = resolvedPath.split("/").slice(0, -1).join("/");
          if (dir) {
            await sandbox.commands.run(`mkdir -p "${dir}"`);
          }

          await sandbox.files.write(resolvedPath, content);

          return {
            success: true,
            path: resolvedPath,
            bytes: content.length,
            message: `File written to ${resolvedPath} (${content.length} chars). It will persist across sessions.`,
          };
        });
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * sandboxReadFile — Read a file from the persistent sandbox filesystem.
 */
const sandboxReadFile = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Read a file from the user's persistent sandbox filesystem. " +
      "Use to inspect scripts, output files, logs, or any file you previously wrote. " +
      "Files from previous sessions are still there — nothing is deleted unless " +
      "you explicitly remove it.",
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "Path to the file inside the sandbox. " +
          "Example: '/home/user/workspace/results.json' or '~/projects/app/main.py'"
        ),
    }),
    execute: async ({ path }) => {
      try {
        return await withSandbox(userId, async (sandbox) => {
          const resolvedPath = path.replace(/^~/, "/home/user");

          try {
            const text = await sandbox.files.read(resolvedPath);
            const MAX = 20_000;
            return {
              success: true,
              path: resolvedPath,
              content:
                text.length > MAX ? `${text.slice(0, MAX)}\n[...truncated]` : text,
              bytes: text.length,
              truncated: text.length > MAX,
            };
          } catch {
            return {
              success: false,
              error: `File not found: ${resolvedPath}`,
            };
          }
        });
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * sandboxListFiles — List files in a directory of the persistent sandbox.
 */
const sandboxListFiles = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List files and directories in the user's persistent sandbox. " +
      "Use to explore what's already installed or built from previous sessions. " +
      "Start with '~/workspace' or '~/projects' to see existing work.",
    inputSchema: z.object({
      path: z
        .string()
        .optional()
        .default("~/workspace")
        .describe("Directory path to list. Defaults to ~/workspace."),
    }),
    execute: async ({ path }) => {
      try {
        return await withSandbox(userId, async (sandbox) => {
          const resolvedPath = (path ?? "~/workspace").replace(/^~/, "/home/user");
          const result = await sandbox.commands.run(`ls -la "${resolvedPath}" 2>&1`);
          return {
            success: result.exitCode === 0,
            path: resolvedPath,
            listing: result.stdout,
            ...(result.exitCode !== 0 && { error: result.stderr }),
          };
        });
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * sandboxInstall — Install packages that persist across sessions.
 * Unlike ephemeral sandboxes, you install once and they're available forever.
 */
const sandboxInstall = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Install packages into the persistent sandbox. Unlike ephemeral sandboxes, " +
      "installed packages PERSIST across all future sessions — install once, use forever. " +
      "Supports: npm (Node.js), pip (Python), apt (system packages), cargo (Rust), " +
      "and any other package manager available in the sandbox. " +
      "Examples: 'npm install playwright', 'pip install pandas numpy', " +
      "'apt-get install -y ffmpeg', 'cargo install ripgrep'",
    inputSchema: z.object({
      packages: z
        .array(z.string())
        .describe("Package names to install. Example: ['playwright', 'dotenv']"),
      manager: z
        .enum(["npm", "pip", "pip3", "apt", "apt-get", "cargo", "uv", "yarn", "pnpm", "brew"])
        .describe(
          "Package manager to use. 'uv' is recommended for Python (fastest). " +
          "'npm' for Node.js. 'apt-get' for system packages."
        ),
      globalFlag: z
        .boolean()
        .optional()
        .default(false)
        .describe("Install globally (npm -g). Default: false."),
    }),
    execute: async ({ packages, manager, globalFlag }) => {
      const packageList = packages.join(" ");
      const commands: Record<string, string> = {
        npm: `npm install ${globalFlag ? "-g" : ""} ${packageList}`,
        yarn: `yarn add ${packageList}`,
        pnpm: `pnpm add ${packageList}`,
        pip: `pip install ${packageList}`,
        pip3: `pip3 install ${packageList}`,
        uv: `uv pip install ${packageList}`,
        "apt-get": `DEBIAN_FRONTEND=noninteractive apt-get install -y ${packageList}`,
        apt: `DEBIAN_FRONTEND=noninteractive apt-get install -y ${packageList}`,
        cargo: `cargo install ${packageList}`,
        brew: `brew install ${packageList}`,
      };

      const command = commands[manager];
      if (!command) {
        return { success: false, error: `Unknown package manager: ${manager}` };
      }

      try {
        return await withSandbox(userId, async (sandbox) => {
          const result = await sandbox.commands.run(command, {
            timeoutMs: 120_000, // package installs can be slow
          });

          return {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            installed: packages,
            output: (result.stdout + result.stderr).trim().slice(0, 3_000),
            message: result.exitCode === 0
              ? `Installed ${packageList} via ${manager}. These packages will persist across all future sessions.`
              : `Installation failed — check output for details.`,
          };
        });
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * sandboxStartService — Start a long-running service in the sandbox.
 * The service runs as a background process. Get a public URL via the response.
 *
 * NOTE: When the sandbox auto-pauses, the service will pause too.
 * On next resume, you need to restart it. Use a startup script for auto-restart.
 */
const sandboxStartService = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Start a background service (web server, API, or any daemon) in the persistent sandbox. " +
      "Returns a public URL you can share with the user. " +
      "Note: The service pauses when the sandbox idles, and resumes when you " +
      "call sandboxRun again to restart it. " +
      "Examples: start a FastAPI server, a Next.js dev server, a Jupyter notebook, " +
      "or a webhook receiver. Use sandboxWriteFile first to write the service code.",
    inputSchema: z.object({
      command: z
        .string()
        .describe(
          "Command to start the service. Example: 'cd ~/projects/app && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000'"
        ),
      port: z
        .number()
        .describe(
          "Port the service listens on. Example: 8000, 3000, 8888. " +
          "This port will be exposed via a public URL."
        ),
      workingDir: z
        .string()
        .optional()
        .describe("Working directory for the service."),
    }),
    execute: async ({ command, port, workingDir }) => {
      try {
        return await withSandbox(userId, async (sandbox) => {
          // Start as background process
          const sessionId = `service-${port}-${Date.now()}`;
          
          // Write a start script for easy restart
          const startScript = `#!/bin/bash\n${workingDir ? `cd ${workingDir} && ` : ""}${command} &\necho "Service started on port ${port} (PID: $!)"\n`;
          await sandbox.files.write("/home/user/.etles/start-service.sh", startScript);
          await sandbox.commands.run("chmod +x /home/user/.etles/start-service.sh");
          
          // Start the process in background
          const bgCommand = `nohup ${workingDir ? `cd ${workingDir} && ` : ""}${command} > /home/user/.etles/service-${port}.log 2>&1 &`;
          await sandbox.commands.run(bgCommand);

          // Give it a moment to start
          await sandbox.commands.run("sleep 2");

          // Check if it's running
          const check = await sandbox.commands.run(`lsof -i :${port} 2>/dev/null | head -5`);

          // Get the public URL via E2B's host mapping
          const host = await sandbox.getHost(port);

          return {
            success: true,
            port,
            publicUrl: `https://${host}`,
            sessionId,
            logFile: `/home/user/.etles/service-${port}.log`,
            restartCommand: `/home/user/.etles/start-service.sh`,
            running: check.exitCode === 0,
            message:
              `Service started on port ${port}. Public URL: https://${host}\n` +
              `To check logs: sandboxRun with 'tail -20 /home/user/.etles/service-${port}.log'\n` +
              `To restart after sandbox wakes: sandboxRun with '/home/user/.etles/start-service.sh'`,
          };
        });
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * sandboxReset — Wipe the sandbox and start fresh.
 * Destroys ALL state — files, packages, services. Irreversible.
 */
const sandboxReset = ({ userId }: { userId: string }) =>
  tool({
    description:
      "DESTRUCTIVE: Completely wipe the persistent sandbox and start fresh. " +
      "All files, installed packages, and running services will be permanently deleted. " +
      "The next sandbox operation will create a brand new clean environment. " +
      "Only use this when the user explicitly asks to start over or the environment is broken.",
    inputSchema: z.object({
      confirm: z
        .literal("RESET_CONFIRMED")
        .describe(
          "Must be exactly 'RESET_CONFIRMED' to proceed. This prevents accidental resets."
        ),
    }),
    execute: async ({ confirm }) => {
      if (confirm !== "RESET_CONFIRMED") {
        return {
          success: false,
          error: "Confirmation not provided. Pass confirm: 'RESET_CONFIRMED' to proceed.",
        };
      }

      try {
        await resetPersistentSandbox(userId);
        return {
          success: true,
          message:
            "Persistent sandbox has been wiped. A fresh sandbox will be created " +
            "automatically on your next operation.",
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });