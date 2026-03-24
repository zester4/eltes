/**
 * lib/ai/tools/daytona.ts
 *
 * Daytona sandbox integration for Etles.
 * Exposes sandboxed code execution, file system, and Git operations as AI tools.
 *
 * Requires:
 *   pnpm install @daytonaio/sdk
 *
 * Env vars:
 *   DAYTONA_API_KEY   — Daytona API key (from app.daytona.io/dashboard)
 *   DAYTONA_API_URL   — Optional; defaults to Daytona cloud
 *   DAYTONA_TARGET    — Optional; e.g. "us" or "eu"
 */

import { tool } from "ai";
import { Daytona } from "@daytonaio/sdk";
import { z } from "zod";

// ── SDK singleton ─────────────────────────────────────────────────────────────
// Re-use the same client across tool calls in a single request.
// The SDK reads DAYTONA_API_KEY / DAYTONA_API_URL / DAYTONA_TARGET from env.
function getDaytona(): Daytona {
  return new Daytona();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Labels used to scope sandboxes to a specific user. */
function userLabels(userId: string) {
  return { etles_user_id: userId };
}

/** Find an existing sandbox for this user by sandboxId, verified to belong to the user. */
async function findUserSandbox(userId: string, sandboxId: string) {
  const daytona = getDaytona();
  const sandbox = await daytona.get(sandboxId);
  if (!sandbox) return null;
  // Verify ownership via labels
  const labels = (sandbox as any).labels as Record<string, string> | undefined;
  if (labels?.etles_user_id && labels.etles_user_id !== userId) return null;
  return sandbox;
}

// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX LIFECYCLE TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createSandbox — Provision a fresh isolated sandbox.
 * Returns the sandboxId to use with all other tools.
 */
export const createSandbox = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Create an isolated Daytona sandbox for safe code execution, file operations, and Git workflows. " +
      "Returns a sandboxId — pass this id to all other sandbox tools. " +
      "Use when the user asks to run code, execute scripts, set up a project, clone a repo, or do anything " +
      "that needs a real execution environment. Optionally clone a Git repository into the sandbox at creation time.",
    inputSchema: z.object({
      language: z
        .enum(["typescript", "javascript", "python"])
        .optional()
        .default("typescript")
        .describe("Runtime language for the sandbox. Default: typescript."),
      repositoryUrl: z
        .string()
        .optional()
        .describe("Optional Git repository URL to clone into the sandbox on startup."),
      autoStopMinutes: z
        .number()
        .min(0)
        .max(480)
        .optional()
        .default(30)
        .describe(
          "Minutes of inactivity before auto-stop. Use 0 to disable (runs indefinitely). Default: 30."
        ),
    }),
    execute: async ({ language, repositoryUrl, autoStopMinutes }) => {
      try {
        const daytona = getDaytona();

        const sandbox = await daytona.create({
          language: language ?? "typescript",
          labels: userLabels(userId),
          autoStopInterval: autoStopMinutes ?? 30,
          // Ephemeral: auto-delete after stopped for 2 hours to keep costs low
          autoDeleteInterval: 120,
        } as any);

        let cloneResult: string | undefined;

        // Optionally clone a repository
        if (repositoryUrl) {
          try {
            await sandbox.git.clone(repositoryUrl, "workspace/repo");
            cloneResult = `Repository cloned to workspace/repo`;
          } catch (e: any) {
            cloneResult = `Warning: clone failed — ${e?.message ?? String(e)}`;
          }
        }

        return {
          success: true,
          sandboxId: sandbox.id,
          language,
          message:
            `Sandbox created (id: ${sandbox.id}, language: ${language}).` +
            (cloneResult ? ` ${cloneResult}` : "") +
            ` Use sandboxId "${sandbox.id}" with all other sandbox tools.`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listSandboxes — List all active sandboxes for this user.
 */
export const listSandboxes = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List all active Daytona sandboxes for this user. " +
      "Use when the user asks 'what sandboxes do I have?' or before creating a new one " +
      "to check if a relevant sandbox already exists.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const daytona = getDaytona();
        const result = await daytona.list(userLabels(userId) as any);
        const sandboxes = (result as any)?.items ?? result ?? [];

        if (!Array.isArray(sandboxes) || sandboxes.length === 0) {
          return { sandboxes: [], message: "No active sandboxes found." };
        }

        return {
          sandboxes: sandboxes.map((s: any) => ({
            id: s.id,
            state: s.state,
            language: s.language ?? "unknown",
            name: s.name ?? s.id,
          })),
        };
      } catch (error: any) {
        return { sandboxes: [], error: error?.message ?? String(error) };
      }
    },
  });

/**
 * deleteSandbox — Permanently delete a sandbox and free all resources.
 */
export const deleteSandbox = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Permanently delete a Daytona sandbox and all its files. " +
      "Use when the user is done with a sandbox or explicitly asks to clean up.",
    inputSchema: z.object({
      sandboxId: z.string().describe("The sandbox ID returned by createSandbox."),
    }),
    execute: async ({ sandboxId }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found or not owned by you.` };
        }
        await sandbox.delete();
        return { success: true, message: `Sandbox ${sandboxId} deleted.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS & CODE EXECUTION TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * executeCommand — Run a shell command inside the sandbox.
 */
export const executeCommand = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Execute a shell command inside a Daytona sandbox and return stdout/stderr. " +
      "Use for: installing packages (npm install, pip install), running build steps, " +
      "checking tool versions, listing files, running tests, or any shell operation. " +
      "Always use an existing sandboxId from createSandbox or listSandboxes.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID from createSandbox."),
      command: z
        .string()
        .describe(
          "Shell command to execute. Examples: 'npm install', 'ls -la', 'python main.py', 'cat package.json'"
        ),
      workingDir: z
        .string()
        .optional()
        .describe("Working directory for the command. Defaults to sandbox home. E.g. 'workspace/repo'"),
      env: z
        .record(z.string())
        .optional()
        .describe("Environment variables to set for this command."),
      timeoutSeconds: z
        .number()
        .min(1)
        .max(300)
        .optional()
        .default(60)
        .describe("Command timeout in seconds. Default: 60."),
    }),
    execute: async ({ sandboxId, command, workingDir, env, timeoutSeconds }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        const response = await sandbox.process.executeCommand(
          command,
          workingDir,
          env,
          timeoutSeconds ?? 60
        );

        return {
          success: response.exitCode === 0,
          exitCode: response.exitCode,
          output: response.result ?? "",
          error: response.exitCode !== 0 ? response.result : undefined,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * runCode — Execute code directly in the sandbox language runtime.
 */
export const runCode = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Run a code snippet directly in the sandbox's language runtime (TypeScript, JavaScript, or Python). " +
      "Use when the user asks to run, test, or execute specific code. " +
      "Returns stdout output. Prefer this over executeCommand for pure code evaluation.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID from createSandbox."),
      code: z
        .string()
        .describe("Code to execute in the sandbox's runtime language."),
      timeoutSeconds: z
        .number()
        .min(1)
        .max(120)
        .optional()
        .default(30)
        .describe("Execution timeout in seconds. Default: 30."),
    }),
    execute: async ({ sandboxId, code, timeoutSeconds }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        const response = await sandbox.process.codeRun(
          code,
          undefined,
          (timeoutSeconds ?? 30) * 1000 // SDK uses milliseconds
        );

        return {
          success: response.exitCode === 0,
          exitCode: response.exitCode,
          output: response.result ?? "",
          error: response.exitCode !== 0 ? response.result : undefined,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// FILE SYSTEM TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * listFiles — List files and directories at a path inside the sandbox.
 */
export const listFiles = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List files and directories at a given path inside the sandbox. " +
      "Use to explore the file structure, verify a clone succeeded, or inspect project contents.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      path: z
        .string()
        .optional()
        .default(".")
        .describe("Path to list. Defaults to the sandbox home directory."),
    }),
    execute: async ({ sandboxId, path }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        const files = await sandbox.fs.listFiles(path ?? ".");

        return {
          success: true,
          path,
          files: files.map((f: any) => ({
            name: f.name,
            isDir: f.isDir,
            size: f.size,
            modified: f.modTime,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * readFile — Download and return the contents of a file from the sandbox.
 */
export const readFile = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Read and return the text contents of a file inside the sandbox. " +
      "Use to inspect source code, config files, build output, or any text file.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      path: z.string().describe("Path to the file inside the sandbox. E.g. 'workspace/repo/package.json'"),
    }),
    execute: async ({ sandboxId, path }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        const buffer = await sandbox.fs.downloadFile(path);
        const content = buffer.toString("utf-8");

        // Truncate very large files to avoid overwhelming the context
        const MAX_CHARS = 20_000;
        const truncated = content.length > MAX_CHARS;

        return {
          success: true,
          path,
          content: truncated ? content.slice(0, MAX_CHARS) + "\n\n[...truncated]" : content,
          truncated,
          size: content.length,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * writeFile — Write text content to a file inside the sandbox.
 */
export const writeFile = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Write text content to a file inside the sandbox (creates or overwrites). " +
      "Use to create source files, config files, scripts, or any file the agent needs to write.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      path: z.string().describe("Destination path inside the sandbox. E.g. 'workspace/repo/index.ts'"),
      content: z.string().describe("Text content to write to the file."),
    }),
    execute: async ({ sandboxId, path, content }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        await sandbox.fs.uploadFile(Buffer.from(content, "utf-8"), path);

        return {
          success: true,
          path,
          message: `File written: ${path} (${content.length} chars)`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * createDirectory — Create a directory inside the sandbox.
 */
export const createDirectory = ({ userId }: { userId: string }) =>
  tool({
    description: "Create a new directory (folder) inside the sandbox at the given path.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      path: z.string().describe("Directory path to create. E.g. 'workspace/src/utils'"),
      permissions: z
        .string()
        .optional()
        .default("755")
        .describe("Unix permissions string. Default: '755'."),
    }),
    execute: async ({ sandboxId, path, permissions }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        await sandbox.fs.createFolder(path, permissions ?? "755");

        return { success: true, path, message: `Directory created: ${path}` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * searchFiles — Search for text patterns recursively across files in the sandbox.
 */
export const searchFiles = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Search for a text pattern across files in the sandbox (like grep). " +
      "Returns matching file paths, line numbers, and content. " +
      "Use to find function definitions, locate TODOs, find import usages, or search for any text in a codebase.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      path: z
        .string()
        .optional()
        .default("workspace")
        .describe("Root directory to search in. Default: 'workspace'."),
      pattern: z.string().describe("Text pattern to search for."),
    }),
    execute: async ({ sandboxId, path, pattern }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        const results = await sandbox.fs.findFiles(path ?? "workspace", pattern);

        const MAX_RESULTS = 50;
        const truncated = Array.isArray(results) && results.length > MAX_RESULTS;

        return {
          success: true,
          pattern,
          path,
          results: (Array.isArray(results) ? results : [])
            .slice(0, MAX_RESULTS)
            .map((m: any) => ({
              file: m.file,
              line: m.line,
              content: m.content,
            })),
          truncated,
          totalMatches: Array.isArray(results) ? results.length : 0,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * replaceInFiles — Find and replace text across multiple files.
 */
export const replaceInFiles = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Find and replace a text pattern across multiple files in the sandbox. " +
      "Use to refactor variable names, update import paths, or make bulk edits.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      files: z
        .array(z.string())
        .describe("List of file paths to perform replacements in."),
      pattern: z.string().describe("Text pattern to find."),
      replacement: z.string().describe("Replacement text."),
    }),
    execute: async ({ sandboxId, files, pattern, replacement }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        await sandbox.fs.replaceInFiles(files, pattern, replacement);

        return {
          success: true,
          message: `Replaced "${pattern}" with "${replacement}" in ${files.length} file(s).`,
          files,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// GIT OPERATION TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * gitClone — Clone a repository into the sandbox.
 */
export const gitClone = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Clone a Git repository into the sandbox. Use when the user wants to work on a repo, " +
      "review code, run tests, or perform any operation that requires a repository. " +
      "For private repos, provide username and a personal access token as password.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      url: z.string().describe("Repository URL. E.g. 'https://github.com/owner/repo.git'"),
      path: z
        .string()
        .optional()
        .default("workspace/repo")
        .describe("Destination path inside the sandbox. Default: 'workspace/repo'."),
      branch: z
        .string()
        .optional()
        .describe("Branch to clone. Defaults to the repo's default branch."),
      username: z
        .string()
        .optional()
        .describe("Git username for private repos. Use 'git' for token-based auth."),
      password: z
        .string()
        .optional()
        .describe("Personal access token or password for private repos."),
    }),
    execute: async ({ sandboxId, url, path, branch, username, password }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        await sandbox.git.clone(
          url,
          path ?? "workspace/repo",
          branch,
          undefined,
          username,
          password
        );

        return {
          success: true,
          url,
          path: path ?? "workspace/repo",
          branch: branch ?? "default",
          message: `Repository cloned to ${path ?? "workspace/repo"}.`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * gitStatus — Get the current status of a Git repository in the sandbox.
 */
export const gitStatus = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Get the Git status of a repository inside the sandbox — current branch, " +
      "modified files, staged changes, and how many commits ahead/behind the remote.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      repoPath: z
        .string()
        .optional()
        .default("workspace/repo")
        .describe("Path to the repository. Default: 'workspace/repo'."),
    }),
    execute: async ({ sandboxId, repoPath }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        const status = await sandbox.git.status(repoPath ?? "workspace/repo");

        return {
          success: true,
          currentBranch: status.currentBranch,
          ahead: status.ahead,
          behind: status.behind,
          changedFiles: (status.fileStatus ?? []).map((f: any) => ({
            name: f.name,
            status: f.status,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * gitCommit — Stage files and create a commit.
 */
export const gitCommit = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Stage specified files and create a Git commit in the sandbox. " +
      "Use after making file changes to save them to version history. " +
      "Pass '.' in files to stage everything.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      repoPath: z
        .string()
        .optional()
        .default("workspace/repo")
        .describe("Path to the repository."),
      files: z
        .array(z.string())
        .describe("Files to stage. Use ['.'] to stage all changes."),
      message: z.string().describe("Commit message."),
      authorName: z
        .string()
        .optional()
        .default("Etles AI")
        .describe("Commit author name."),
      authorEmail: z
        .string()
        .optional()
        .default("agent@etles.app")
        .describe("Commit author email."),
    }),
    execute: async ({ sandboxId, repoPath, files, message, authorName, authorEmail }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        const path = repoPath ?? "workspace/repo";

        await sandbox.git.add(path, files);
        await sandbox.git.commit(
          path,
          message,
          authorName ?? "Etles AI",
          authorEmail ?? "agent@etles.app",
          false
        );

        return {
          success: true,
          message: `Committed: "${message}" (staged: ${files.join(", ")})`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * gitPush — Push commits to the remote repository.
 */
export const gitPush = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Push local commits to the remote Git repository. " +
      "For private repos, provide a personal access token as password.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      repoPath: z
        .string()
        .optional()
        .default("workspace/repo")
        .describe("Path to the repository."),
      username: z.string().optional().describe("Git username for authentication."),
      password: z
        .string()
        .optional()
        .describe("Personal access token or password."),
    }),
    execute: async ({ sandboxId, repoPath, username, password }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        await sandbox.git.push(
          repoPath ?? "workspace/repo",
          username,
          password
        );

        return { success: true, message: "Changes pushed to remote." };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * gitPull — Pull latest changes from the remote repository.
 */
export const gitPull = ({ userId }: { userId: string }) =>
  tool({
    description: "Pull the latest changes from the remote repository into the sandbox.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      repoPath: z
        .string()
        .optional()
        .default("workspace/repo")
        .describe("Path to the repository."),
      username: z.string().optional().describe("Git username for private repos."),
      password: z.string().optional().describe("Token or password for private repos."),
    }),
    execute: async ({ sandboxId, repoPath, username, password }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        await sandbox.git.pull(
          repoPath ?? "workspace/repo",
          username,
          password
        );

        return { success: true, message: "Latest changes pulled from remote." };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * gitBranch — List branches or create/checkout a branch.
 */
export const gitBranch = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Manage Git branches in the sandbox. " +
      "List existing branches, create a new branch, or checkout an existing one.",
    inputSchema: z.object({
      sandboxId: z.string().describe("Sandbox ID."),
      repoPath: z
        .string()
        .optional()
        .default("workspace/repo")
        .describe("Path to the repository."),
      action: z
        .enum(["list", "create", "checkout"])
        .describe("Action to perform: 'list' all branches, 'create' a new branch, or 'checkout' an existing one."),
      branchName: z
        .string()
        .optional()
        .describe("Branch name (required for 'create' and 'checkout')."),
    }),
    execute: async ({ sandboxId, repoPath, action, branchName }) => {
      try {
        const sandbox = await findUserSandbox(userId, sandboxId);
        if (!sandbox) {
          return { success: false, error: `Sandbox ${sandboxId} not found.` };
        }

        const path = repoPath ?? "workspace/repo";

        if (action === "list") {
          const result = await sandbox.git.branches(path);
          return {
            success: true,
            branches: (result as any)?.branches ?? result ?? [],
          };
        }

        if (!branchName) {
          return { success: false, error: "branchName is required for 'create' and 'checkout' actions." };
        }

        if (action === "create") {
          await sandbox.git.createBranch(path, branchName);
          return { success: true, message: `Branch '${branchName}' created.` };
        }

        // checkout
        await sandbox.git.checkoutBranch(path, branchName);
        return { success: true, message: `Switched to branch '${branchName}'.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });