import { tool } from "ai";
import { exec } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { z } from "zod";

// ─── Oracle Cloud SSH Agent Tools ────────────────────────────────────────────
//
// ✅ ZERO extra npm dependencies — uses Node.js built-ins + system ssh binary.
//
// Required env vars:
//   ORACLE_SSH_HOST         – Your Oracle Cloud public IP (e.g. 147.224.13.133)
//   ORACLE_SSH_USER         – SSH username (default: ubuntu)
//   ORACLE_SSH_PRIVATE_KEY  – Raw PEM private key string (incl. headers)
//                             OR
//   ORACLE_SSH_KEY_PATH     – Absolute path to private key file on THIS machine
//   ORACLE_SSH_PORT         – SSH port (default: 22)
//   ORACLE_WORK_DIR         – Default working directory (default: /home/ubuntu)

const execAsync = promisify(exec);

// ─── SSH Key Helper ───────────────────────────────────────────────────────────
// Writes the private key to a secure temp file for the duration of each call,
// then deletes it. Avoids key exposure in shell arguments.

function withTempKey<T>(fn: (keyPath: string) => Promise<T>): Promise<T> {
  const rawKey = process.env.ORACLE_SSH_PRIVATE_KEY;
  const keyPath = process.env.ORACLE_SSH_KEY_PATH;

  if (keyPath) {
    return fn(keyPath);
  }
  if (!rawKey) {
    throw new Error("Set ORACLE_SSH_PRIVATE_KEY or ORACLE_SSH_KEY_PATH.");
  }

  const tmp = path.join(
    os.tmpdir(),
    `oracle_${crypto.randomBytes(8).toString("hex")}.pem`
  );
  fs.writeFileSync(tmp, rawKey.replace(/\\n/g, "\n"), { mode: 0o600 });
  return fn(tmp).finally(() => {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  });
}

function sshBase() {
  const host = process.env.ORACLE_SSH_HOST;
  if (!host) {
    throw new Error("ORACLE_SSH_HOST must be set.");
  }
  return {
    host,
    user: process.env.ORACLE_SSH_USER || "ubuntu",
    port: process.env.ORACLE_SSH_PORT || "22",
  };
}

async function sshExec(
  command: string,
  cwd?: string,
  timeoutMs = 30_000
): Promise<{ stdout: string; stderr: string; code: number }> {
  return withTempKey(async (keyPath) => {
    const { host, user, port } = sshBase();
    const flags = `-i ${keyPath} -p ${port} -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes`;
    const cdPrefix = cwd ? `cd ${cwd} && ` : "";
    // Wrap command in single quotes, escaping any internal single quotes
    const escaped = command.replace(/'/g, `'"'"'`);
    const fullCmd = `ssh ${flags} ${user}@${host} '${cdPrefix}${escaped}'`;
    try {
      const { stdout, stderr } = await execAsync(fullCmd, {
        timeout: timeoutMs,
      });
      return { stdout: stdout || "", stderr: stderr || "", code: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
        code: err.code ?? 1,
      };
    }
  });
}

function workDir() {
  return process.env.ORACLE_WORK_DIR || "/home/ubuntu";
}

// Safe base64-based file write — handles all special chars without shell escaping issues
async function b64Write(
  content: string,
  remotePath: string,
  sudoPrefix = ""
): Promise<{ stdout: string; stderr: string; code: number }> {
  const b64 = Buffer.from(content, "utf8").toString("base64");
  const cmd = `echo '${b64}' | base64 -d | ${sudoPrefix}tee ${remotePath} > /dev/null`;
  return sshExec(cmd, workDir(), 20_000);
}

// =============================================================================
// SECTION 1 — COMMAND EXECUTION
// =============================================================================

export const oracleSSHExec = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Execute any shell command on the Oracle Cloud server over SSH. " +
      "Returns stdout, stderr, and exit code. " +
      "Supports pipes, &&, ||, redirects, sudo, and multi-statement chains. " +
      "Zero external npm dependencies — uses the system ssh binary.",
    inputSchema: z.object({
      command: z
        .string()
        .describe(
          "Shell command. Example: 'pm2 status' or 'df -h && free -h'."
        ),
      cwd: z
        .string()
        .optional()
        .describe("Working directory. Defaults to ORACLE_WORK_DIR."),
      timeout_ms: z
        .number()
        .int()
        .min(1000)
        .max(300_000)
        .optional()
        .default(30_000),
      sudo: z.boolean().optional().default(false),
    }),
    execute: async ({ command, cwd, timeout_ms, sudo }) => {
      try {
        const cmd = sudo ? `sudo ${command}` : command;
        const r = await sshExec(cmd, cwd || workDir(), timeout_ms);
        return {
          success: r.code === 0,
          exit_code: r.code,
          stdout: r.stdout,
          stderr: r.stderr,
          command: cmd,
        };
      } catch (error: any) {
        return {
          success: false,
          exit_code: -1,
          stdout: "",
          stderr: error.message,
          command,
        };
      }
    },
  });

export const oracleSSHExecMany = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Run multiple shell commands sequentially. Returns per-step results. " +
      "Stops on first failure by default. Perfect for deploy pipelines.",
    inputSchema: z.object({
      commands: z.array(z.string()).min(1).max(20),
      cwd: z.string().optional(),
      stop_on_error: z.boolean().optional().default(true),
      timeout_ms: z.number().int().optional().default(60_000),
    }),
    execute: async ({ commands, cwd, stop_on_error, timeout_ms }) => {
      const dir = cwd || workDir();
      const results: Array<{
        command: string;
        success: boolean;
        exit_code: number;
        stdout: string;
        stderr: string;
      }> = [];
      for (const command of commands) {
        const r = await sshExec(command, dir, timeout_ms);
        results.push({
          command,
          success: r.code === 0,
          exit_code: r.code,
          stdout: r.stdout,
          stderr: r.stderr,
        });
        if (stop_on_error && r.code !== 0) {
          break;
        }
      }
      return {
        success: results.every((r) => r.success),
        results,
        total: results.length,
      };
    },
  });

// =============================================================================
// SECTION 2 — FILE OPERATIONS
// =============================================================================

export const oracleSSHReadFile = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Read a file from the Oracle server. Supports head (max_lines) and tail (tail_lines) modes.",
    inputSchema: z.object({
      path: z.string().describe("Absolute file path on server."),
      max_lines: z.number().int().min(1).max(5000).optional(),
      tail_lines: z.number().int().min(1).max(1000).optional(),
    }),
    execute: async ({ path: filePath, max_lines, tail_lines }) => {
      const cmd = tail_lines
        ? `tail -n ${tail_lines} ${filePath}`
        : max_lines
          ? `head -n ${max_lines} ${filePath}`
          : `cat ${filePath}`;
      const r = await sshExec(cmd, workDir());
      return r.code === 0
        ? {
            success: true,
            path: filePath,
            content: r.stdout,
            lines: r.stdout.split("\n").length,
          }
        : { success: false, content: null, error: r.stderr };
    },
  });

export const oracleSSHWriteFile = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Write or append content to a file on the Oracle server. " +
      "Uses base64 transfer — handles any characters safely. ⚠️ Overwrites unless append: true.",
    inputSchema: z.object({
      path: z.string(),
      content: z.string(),
      append: z.boolean().optional().default(false),
      create_dirs: z.boolean().optional().default(false),
      sudo: z.boolean().optional().default(false),
    }),
    execute: async ({ path: filePath, content, append, create_dirs, sudo }) => {
      try {
        const prefix = sudo ? "sudo " : "";
        if (create_dirs) {
          await sshExec(`${prefix}mkdir -p $(dirname ${filePath})`, workDir());
        }
        if (append) {
          const b64 = Buffer.from(content).toString("base64");
          const r = await sshExec(
            `echo '${b64}' | base64 -d | ${prefix}tee -a ${filePath} > /dev/null`,
            workDir(),
            20_000
          );
          return r.code === 0
            ? { success: true, path: filePath, action: "appended" }
            : { success: false, error: r.stderr };
        }
        const r = await b64Write(content, filePath, prefix);
        return r.code === 0
          ? {
              success: true,
              path: filePath,
              action: "written",
              bytes: Buffer.byteLength(content),
            }
          : { success: false, error: r.stderr };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });

export const oracleSSHListFiles = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List files and directories. Supports glob patterns and recursive mode.",
    inputSchema: z.object({
      path: z.string().optional(),
      show_hidden: z.boolean().optional().default(false),
      recursive: z.boolean().optional().default(false),
      filter_pattern: z
        .string()
        .optional()
        .describe("Glob filter e.g. '*.js', '*.log'"),
    }),
    execute: async ({ path: dir, show_hidden, recursive, filter_pattern }) => {
      const target = dir || workDir();
      let cmd: string;
      if (recursive || filter_pattern) {
        const hidden = show_hidden ? "" : "! -path '*/\\.*'";
        const name = filter_pattern ? `-name "${filter_pattern}"` : "";
        const depth = recursive ? "" : "-maxdepth 1";
        cmd =
          `find ${target} ${depth} ${hidden} ${name} ! -path "${target}" | sort`.replace(
            /\s+/g,
            " "
          );
      } else {
        cmd = `ls -la${show_hidden ? "A" : ""} ${target}`;
      }
      const r = await sshExec(cmd, workDir());
      return {
        success: r.code === 0,
        path: target,
        listing: r.stdout,
        error: r.code === 0 ? undefined : r.stderr,
      };
    },
  });

export const oracleSSHFileOps = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Move, copy, delete, or create directories on the Oracle server.",
    inputSchema: z.object({
      action: z.enum(["move", "copy", "delete", "mkdir", "chmod", "chown"]),
      path: z
        .string()
        .describe("Source path (or target for mkdir/chmod/chown)."),
      destination: z.string().optional().describe("Destination for move/copy."),
      recursive: z.boolean().optional().default(false),
      sudo: z.boolean().optional().default(false),
      mode: z
        .string()
        .optional()
        .describe("Permission mode for chmod, e.g. '755', '+x'."),
      owner: z
        .string()
        .optional()
        .describe("Owner for chown, e.g. 'ubuntu:ubuntu'."),
    }),
    execute: async ({
      action,
      path: filePath,
      destination,
      recursive,
      sudo,
      mode,
      owner,
    }) => {
      const p = sudo ? "sudo " : "";
      const rf = recursive ? "-rf " : "";
      const r_flag = recursive ? "-r " : "";
      const cmds: Record<string, string | null> = {
        move: destination ? `${p}mv ${filePath} ${destination}` : null,
        copy: destination ? `${p}cp ${r_flag}${filePath} ${destination}` : null,
        delete: `${p}rm ${rf}${filePath}`,
        mkdir: `${p}mkdir -p ${filePath}`,
        chmod: mode
          ? `${p}chmod ${recursive ? "-R " : ""}${mode} ${filePath}`
          : null,
        chown: owner
          ? `${p}chown ${recursive ? "-R " : ""}${owner} ${filePath}`
          : null,
      };
      const cmd = cmds[action];
      if (!cmd) {
        return {
          success: false,
          error: `Missing required param for '${action}'`,
        };
      }
      const r = await sshExec(cmd, workDir());
      return {
        success: r.code === 0,
        action,
        path: filePath,
        destination,
        error: r.code === 0 ? undefined : r.stderr,
      };
    },
  });

export const oracleSSHUploadFile = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Upload text content to the Oracle server via base64+SSH. No scp needed.",
    inputSchema: z.object({
      content: z.string(),
      remote_path: z.string(),
      make_executable: z.boolean().optional().default(false),
    }),
    execute: async ({ content, remote_path, make_executable }) => {
      try {
        await sshExec(`mkdir -p $(dirname ${remote_path})`, workDir());
        const r = await b64Write(content, remote_path);
        if (r.code !== 0) {
          return { success: false, error: r.stderr };
        }
        if (make_executable) {
          await sshExec(`chmod +x ${remote_path}`, workDir());
        }
        return {
          success: true,
          remote_path,
          bytes: Buffer.byteLength(content),
          executable: make_executable,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });

// =============================================================================
// SECTION 3 — PM2 PROCESS MANAGEMENT
// =============================================================================

export const oracleSSHPM2 = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Manage Node.js processes via PM2. Actions: status, restart, stop, start, delete, reload, logs, save, flush_logs, describe.",
    inputSchema: z.object({
      action: z.enum([
        "status",
        "restart",
        "stop",
        "start",
        "delete",
        "reload",
        "logs",
        "save",
        "flush_logs",
        "describe",
      ]),
      process_name: z.string().optional(),
      log_lines: z.number().int().min(1).max(500).optional().default(50),
      update_env: z.boolean().optional().default(true),
      start_script: z.string().optional(),
    }),
    execute: async ({
      action,
      process_name,
      log_lines,
      update_env,
      start_script,
    }) => {
      const name = process_name || "";
      const needsName = [
        "restart",
        "stop",
        "delete",
        "reload",
        "logs",
        "describe",
        "flush_logs",
      ];
      if (needsName.includes(action) && !name) {
        return {
          success: false,
          error: `process_name required for '${action}'`,
        };
      }
      const cmds: Record<string, string> = {
        status: "pm2 list",
        restart: `pm2 restart ${name}${update_env ? " --update-env" : ""}`,
        reload: `pm2 reload ${name}`,
        stop: `pm2 stop ${name}`,
        delete: `pm2 delete ${name}`,
        start: `pm2 start ${start_script || "server.js"}${name ? ` --name ${name}` : ""}`,
        logs: `pm2 logs ${name} --lines ${log_lines} --nostream`,
        save: "pm2 save",
        flush_logs: `pm2 flush ${name}`,
        describe: `pm2 describe ${name}`,
      };
      const r = await sshExec(
        cmds[action],
        workDir(),
        action === "logs" ? 15_000 : 30_000
      );
      return {
        success: r.code === 0,
        action,
        process_name: name,
        output: (r.stdout + "\n" + r.stderr).trim(),
        exit_code: r.code,
      };
    },
  });

// =============================================================================
// SECTION 4 — DEPLOYMENT & GIT
// =============================================================================

export const oracleSSHDeploy = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Full deploy: git pull → npm install → pm2 restart. Returns step-by-step logs.",
    inputSchema: z.object({
      app_dir: z.string().optional(),
      pm2_process_name: z.string().optional(),
      branch: z.string().optional().default("main"),
      npm_install: z.boolean().optional().default(true),
      pre_commands: z.array(z.string()).optional(),
      post_commands: z.array(z.string()).optional(),
    }),
    execute: async ({
      app_dir,
      pm2_process_name,
      branch,
      npm_install,
      pre_commands,
      post_commands,
    }) => {
      const dir = app_dir || workDir();
      const steps: Array<{ step: string; success: boolean; output: string }> =
        [];
      async function run(step: string, cmd: string): Promise<boolean> {
        const r = await sshExec(cmd, dir, 120_000);
        steps.push({
          step,
          success: r.code === 0,
          output: (r.stdout + "\n" + r.stderr).trim(),
        });
        return r.code === 0;
      }
      for (const cmd of pre_commands || []) {
        if (!(await run(`pre: ${cmd}`, cmd))) {
          return { success: false, steps, summary: `❌ Failed at: ${cmd}` };
        }
      }
      if (!(await run("git pull", `git pull origin ${branch}`))) {
        return { success: false, steps, summary: "❌ git pull failed" };
      }
      if (
        npm_install &&
        !(await run("npm install", "npm ci --only=production"))
      ) {
        return { success: false, steps, summary: "❌ npm install failed" };
      }
      if (pm2_process_name) {
        await run(
          `pm2 restart ${pm2_process_name}`,
          `pm2 restart ${pm2_process_name} --update-env && pm2 save`
        );
      }
      for (const cmd of post_commands || []) {
        if (!(await run(`post: ${cmd}`, cmd))) {
          return { success: false, steps, summary: `❌ Failed at: ${cmd}` };
        }
      }
      return {
        success: true,
        app_dir: dir,
        steps,
        summary: `✅ Deployed in ${steps.length} steps`,
      };
    },
  });

export const oracleSSHGit = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Run git operations: status, log, diff, branch, stash, reset_hard, clone, pull, fetch.",
    inputSchema: z.object({
      action: z.enum([
        "status",
        "log",
        "diff",
        "branch",
        "stash",
        "reset_hard",
        "clone",
        "pull",
        "fetch",
      ]),
      app_dir: z.string().optional(),
      branch: z.string().optional(),
      clone_url: z.string().optional(),
      clone_dir: z.string().optional(),
      log_count: z.number().int().optional().default(10),
    }),
    execute: async ({
      action,
      app_dir,
      branch,
      clone_url,
      clone_dir,
      log_count,
    }) => {
      const dir = app_dir || workDir();
      const cmds: Record<string, string> = {
        status: "git status",
        log: `git log --oneline -${log_count}`,
        diff: "git diff HEAD",
        branch: "git branch -a",
        stash: "git stash",
        reset_hard: `git reset --hard origin/${branch || "main"}`,
        pull: `git pull origin ${branch || "main"}`,
        fetch: "git fetch --all",
        clone: `git clone ${clone_url} ${clone_dir || ""}`,
      };
      const r = await sshExec(
        cmds[action],
        action === "clone" ? workDir() : dir,
        60_000
      );
      return {
        success: r.code === 0,
        action,
        output: (r.stdout + "\n" + r.stderr).trim(),
      };
    },
  });

// =============================================================================
// SECTION 5 — SYSTEM MONITORING
// =============================================================================

export const oracleSSHSystemStats = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Full system health snapshot: CPU, memory, disk, uptime, load, top processes, PM2, nginx. Essential for the 1GB Oracle instance.",
    inputSchema: z.object({}),
    execute: async () => {
      const checks: Record<string, string> = {
        uptime: "uptime",
        memory: "free -h",
        disk: "df -h /",
        load: "cat /proc/loadavg",
        swap: "swapon --show 2>/dev/null || echo 'No swap'",
        top_processes: "ps aux --sort=-%mem | head -8",
        open_ports: "ss -tlnp 2>/dev/null | head -15",
        pm2: "pm2 list 2>/dev/null || echo 'PM2 not running'",
        nginx: "systemctl is-active nginx 2>/dev/null",
        node_version: "node -v 2>/dev/null || echo 'not found'",
        os_info: "lsb_release -d 2>/dev/null || head -3 /etc/os-release",
        last_reboot: "who -b 2>/dev/null || last reboot | head -1",
      };
      const stats: Record<string, string> = {};
      for (const [key, cmd] of Object.entries(checks)) {
        const r = await sshExec(cmd, workDir(), 10_000);
        stats[key] = (r.stdout || r.stderr || "").trim();
      }
      return { success: true, stats };
    },
  });

export const oracleSSHTailLogs = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Tail logs: PM2 app, nginx access/error, syslog, auth log, or custom path. Supports grep filtering.",
    inputSchema: z.object({
      source: z.enum([
        "pm2",
        "nginx_access",
        "nginx_error",
        "syslog",
        "auth",
        "custom",
      ]),
      process_name: z.string().optional(),
      custom_path: z.string().optional(),
      lines: z.number().int().min(1).max(1000).optional().default(100),
      grep: z
        .string()
        .optional()
        .describe("Include lines containing this string."),
      grep_invert: z
        .string()
        .optional()
        .describe("Exclude lines containing this string."),
    }),
    execute: async ({
      source,
      process_name,
      custom_path,
      lines,
      grep,
      grep_invert,
    }) => {
      const logPaths: Record<string, string> = {
        nginx_access: "/var/log/nginx/access.log",
        nginx_error: "/var/log/nginx/error.log",
        syslog: "/var/log/syslog",
        auth: "/var/log/auth.log",
      };
      let cmd: string;
      if (source === "pm2") {
        if (!process_name) {
          return { success: false, error: "process_name required for pm2" };
        }
        cmd = `pm2 logs ${process_name} --lines ${lines} --nostream`;
      } else if (source === "custom") {
        if (!custom_path) {
          return { success: false, error: "custom_path required" };
        }
        cmd = `sudo tail -n ${lines} ${custom_path}`;
      } else {
        cmd = `sudo tail -n ${lines} ${logPaths[source]}`;
      }
      if (grep) {
        cmd += ` | grep -i "${grep}"`;
      }
      if (grep_invert) {
        cmd += ` | grep -iv "${grep_invert}"`;
      }
      const r = await sshExec(cmd, workDir(), 15_000);
      return {
        success: r.code === 0 || !!r.stdout,
        source,
        content: r.stdout || r.stderr || "(no output)",
      };
    },
  });

// =============================================================================
// SECTION 6 — NGINX MANAGEMENT
// =============================================================================

export const oracleSSHNginx = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Manage nginx: status, test, reload, restart, get_config, set_config, add_site. set_config always tests before applying.",
    inputSchema: z.object({
      action: z.enum([
        "status",
        "test",
        "reload",
        "restart",
        "get_config",
        "set_config",
        "add_site",
      ]),
      new_config: z.string().optional(),
      config_path: z
        .string()
        .optional()
        .default("/etc/nginx/sites-available/default"),
      site_name: z.string().optional(),
      site_config: z.string().optional(),
    }),
    execute: async ({
      action,
      new_config,
      config_path,
      site_name,
      site_config,
    }) => {
      const cfgPath = config_path || "/etc/nginx/sites-available/default";
      try {
        switch (action) {
          case "status": {
            const r = await sshExec(
              "systemctl is-active nginx && sudo nginx -v 2>&1",
              workDir()
            );
            return { success: true, output: (r.stdout + r.stderr).trim() };
          }
          case "test": {
            const r = await sshExec("sudo nginx -t 2>&1", workDir());
            return {
              success: r.code === 0,
              valid: r.code === 0,
              output: (r.stdout + r.stderr).trim(),
            };
          }
          case "reload": {
            const test = await sshExec("sudo nginx -t 2>&1", workDir());
            if (test.code !== 0) {
              return {
                success: false,
                error: "Config invalid — reload aborted",
                details: (test.stdout + test.stderr).trim(),
              };
            }
            const r = await sshExec("sudo systemctl reload nginx", workDir());
            return { success: r.code === 0, output: r.stdout || "Reloaded" };
          }
          case "restart": {
            const r = await sshExec("sudo systemctl restart nginx", workDir());
            return { success: r.code === 0, output: r.stdout || "Restarted" };
          }
          case "get_config": {
            const r = await sshExec(`sudo cat ${cfgPath}`, workDir());
            return { success: r.code === 0, config: r.stdout, path: cfgPath };
          }
          case "set_config": {
            if (!new_config) {
              return { success: false, error: "new_config required" };
            }
            await sshExec(`sudo cp ${cfgPath} ${cfgPath}.bak`, workDir());
            const wr = await b64Write(new_config, cfgPath, "sudo ");
            if (wr.code !== 0) {
              return { success: false, error: wr.stderr };
            }
            const test = await sshExec("sudo nginx -t 2>&1", workDir());
            if (test.code !== 0) {
              await sshExec(`sudo cp ${cfgPath}.bak ${cfgPath}`, workDir());
              return {
                success: false,
                error: "Invalid config — original restored",
                details: (test.stdout + test.stderr).trim(),
              };
            }
            await sshExec("sudo systemctl reload nginx", workDir());
            return {
              success: true,
              message: "Config updated and nginx reloaded",
              backup: `${cfgPath}.bak`,
            };
          }
          case "add_site": {
            if (!site_name || !site_config) {
              return {
                success: false,
                error: "site_name and site_config required",
              };
            }
            const sitePath = `/etc/nginx/sites-available/${site_name}`;
            const linkPath = `/etc/nginx/sites-enabled/${site_name}`;
            const wr = await b64Write(site_config, sitePath, "sudo ");
            if (wr.code !== 0) {
              return { success: false, error: wr.stderr };
            }
            await sshExec(`sudo ln -sf ${sitePath} ${linkPath}`, workDir());
            const test = await sshExec("sudo nginx -t 2>&1", workDir());
            if (test.code !== 0) {
              await sshExec(`sudo rm -f ${sitePath} ${linkPath}`, workDir());
              return {
                success: false,
                error: "Invalid site config — removed",
                details: (test.stdout + test.stderr).trim(),
              };
            }
            await sshExec("sudo systemctl reload nginx", workDir());
            return {
              success: true,
              message: `Site '${site_name}' added`,
              path: sitePath,
            };
          }
          default:
            return { success: false, error: "Unknown action" };
        }
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });

// =============================================================================
// SECTION 7 — ENV MANAGEMENT
// =============================================================================

export const oracleSSHEnvManager = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Manage .env file: read, list_keys (safe — no values), set, delete, backup. Restart PM2 with update_env after changes.",
    inputSchema: z.object({
      action: z.enum(["read", "list_keys", "set", "delete", "backup"]),
      env_file: z.string().optional(),
      vars: z.record(z.string(), z.string()).optional(),
      key: z.string().optional(),
    }),
    execute: async ({ action, env_file, vars, key }) => {
      const envFile = env_file || `${workDir()}/.env`;
      switch (action) {
        case "read": {
          const r = await sshExec(`cat ${envFile}`, workDir());
          return r.code === 0
            ? { success: true, content: r.stdout }
            : { success: false, error: r.stderr };
        }
        case "list_keys": {
          const r = await sshExec(
            `grep -v '^#' ${envFile} | grep '=' | cut -d= -f1 | sort`,
            workDir()
          );
          return { success: true, keys: r.stdout.split("\n").filter(Boolean) };
        }
        case "set": {
          if (!vars) {
            return { success: false, error: "vars required" };
          }
          const cmds = Object.entries(vars)
            .map(
              ([k, v]) =>
                `sed -i '/^${k}=/d' ${envFile} && echo '${k}=${v}' >> ${envFile}`
            )
            .join(" && ");
          const r = await sshExec(cmds, workDir(), 15_000);
          return r.code === 0
            ? { success: true, keys_updated: Object.keys(vars) }
            : { success: false, error: r.stderr };
        }
        case "delete": {
          if (!key) {
            return { success: false, error: "key required" };
          }
          const r = await sshExec(`sed -i '/^${key}=/d' ${envFile}`, workDir());
          return { success: r.code === 0, deleted: key };
        }
        case "backup": {
          const backup = `${envFile}.backup.${Date.now()}`;
          const r = await sshExec(`cp ${envFile} ${backup}`, workDir());
          return r.code === 0
            ? { success: true, backup_path: backup }
            : { success: false, error: r.stderr };
        }
        default:
          return { success: false, error: "Unknown action" };
      }
    },
  });

// =============================================================================
// SECTION 8 — CRON JOBS
// =============================================================================

export const oracleSSHCron = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Manage cron jobs: list, add, remove by pattern, or clear all. Use for scheduled deploys, backups, health checks.",
    inputSchema: z.object({
      action: z.enum(["list", "add", "remove", "clear"]),
      schedule: z
        .string()
        .optional()
        .describe("Cron expression e.g. '0 2 * * *'"),
      command: z.string().optional(),
      remove_pattern: z.string().optional(),
    }),
    execute: async ({ action, schedule, command, remove_pattern }) => {
      switch (action) {
        case "list": {
          const r = await sshExec(
            "crontab -l 2>/dev/null || echo '(no cron jobs)'",
            workDir()
          );
          return { success: true, crontab: r.stdout };
        }
        case "add": {
          if (!schedule || !command) {
            return { success: false, error: "schedule and command required" };
          }
          const r = await sshExec(
            `(crontab -l 2>/dev/null; echo "${schedule} ${command}") | crontab -`,
            workDir()
          );
          return r.code === 0
            ? { success: true, added: `${schedule} ${command}` }
            : { success: false, error: r.stderr };
        }
        case "remove": {
          if (!remove_pattern) {
            return { success: false, error: "remove_pattern required" };
          }
          const r = await sshExec(
            `crontab -l 2>/dev/null | grep -v "${remove_pattern}" | crontab -`,
            workDir()
          );
          return r.code === 0
            ? { success: true, removed_pattern: remove_pattern }
            : { success: false, error: r.stderr };
        }
        case "clear": {
          await sshExec("crontab -r 2>/dev/null; true", workDir());
          return { success: true, message: "All cron jobs removed" };
        }
        default:
          return { success: false, error: "Unknown action" };
      }
    },
  });

// =============================================================================
// SECTION 9 — NETWORK & FIREWALL
// =============================================================================

export const oracleSSHNetwork = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Network diagnostics and iptables firewall management: open ports, connections, ping, DNS, curl test, firewall rules.",
    inputSchema: z.object({
      action: z.enum([
        "open_ports",
        "connections",
        "ping",
        "dns_lookup",
        "firewall_list",
        "firewall_open_port",
        "firewall_close_port",
        "firewall_save",
        "curl_test",
      ]),
      target: z.string().optional(),
      port: z.number().int().optional(),
      protocol: z.enum(["tcp", "udp"]).optional().default("tcp"),
    }),
    execute: async ({ action, target, port, protocol }) => {
      switch (action) {
        case "open_ports": {
          const r = await sshExec("sudo ss -tlnp", workDir());
          return { success: true, output: r.stdout };
        }
        case "connections": {
          const r = await sshExec("sudo ss -tnp | head -30", workDir());
          return { success: true, output: r.stdout };
        }
        case "ping": {
          if (!target) {
            return { success: false, error: "target required" };
          }
          const r = await sshExec(`ping -c 4 ${target}`, workDir(), 15_000);
          return { success: r.code === 0, output: r.stdout };
        }
        case "dns_lookup": {
          if (!target) {
            return { success: false, error: "target required" };
          }
          const r = await sshExec(`nslookup ${target}`, workDir(), 10_000);
          return { success: true, output: (r.stdout + r.stderr).trim() };
        }
        case "firewall_list": {
          const r = await sshExec(
            "sudo iptables -L INPUT -n --line-numbers",
            workDir()
          );
          return { success: true, output: r.stdout };
        }
        case "firewall_open_port": {
          if (!port) {
            return { success: false, error: "port required" };
          }
          const r = await sshExec(
            `sudo iptables -I INPUT 4 -m state --state NEW -p ${protocol} --dport ${port} -j ACCEPT && sudo netfilter-persistent save`,
            workDir()
          );
          return {
            success: r.code === 0,
            message: `Port ${port}/${protocol} opened`,
          };
        }
        case "firewall_close_port": {
          if (!port) {
            return { success: false, error: "port required" };
          }
          await sshExec(
            `sudo iptables -D INPUT -m state --state NEW -p ${protocol} --dport ${port} -j ACCEPT 2>/dev/null; sudo netfilter-persistent save`,
            workDir()
          );
          return { success: true, message: `Port ${port}/${protocol} closed` };
        }
        case "firewall_save": {
          const r = await sshExec("sudo netfilter-persistent save", workDir());
          return { success: r.code === 0, output: r.stdout };
        }
        case "curl_test": {
          if (!target) {
            return { success: false, error: "target required" };
          }
          const r = await sshExec(
            `curl -sI --max-time 10 ${target}`,
            workDir(),
            15_000
          );
          return {
            success: r.code === 0,
            output: (r.stdout + r.stderr).trim(),
          };
        }
        default:
          return { success: false, error: "Unknown action" };
      }
    },
  });

// =============================================================================
// SECTION 10 — PACKAGE MANAGEMENT
// =============================================================================

export const oracleSSHPackages = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Manage Ubuntu packages via apt: install, remove, update, upgrade, search, list_installed. Use timeout_ms up to 120s for installs.",
    inputSchema: z.object({
      action: z.enum([
        "install",
        "remove",
        "update",
        "upgrade",
        "search",
        "list_installed",
        "check",
      ]),
      packages: z.array(z.string()).optional(),
      timeout_ms: z.number().int().optional().default(120_000),
    }),
    execute: async ({ action, packages, timeout_ms }) => {
      const pkgs = packages?.join(" ") || "";
      if (["install", "remove", "check"].includes(action) && !pkgs) {
        return { success: false, error: "packages required" };
      }
      const cmds: Record<string, string> = {
        install: `sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${pkgs}`,
        remove: `sudo apt-get remove -y ${pkgs}`,
        update: "sudo apt-get update",
        upgrade: "sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y",
        search: `apt-cache search ${pkgs}`,
        list_installed:
          "dpkg -l | grep '^ii' | awk '{print $2, $3}' | head -50",
        check: `dpkg -l ${pkgs} 2>/dev/null | grep '^ii'`,
      };
      const r = await sshExec(cmds[action], workDir(), timeout_ms);
      return {
        success: r.code === 0,
        action,
        output: (r.stdout + r.stderr).trim(),
      };
    },
  });

// =============================================================================
// SECTION 11 — SYSTEMD SERVICE MANAGEMENT
// =============================================================================

export const oracleSSHService = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Manage systemd services: start, stop, restart, reload, enable, disable, status, list. Works for nginx, cron, ssh, etc.",
    inputSchema: z.object({
      action: z.enum([
        "status",
        "start",
        "stop",
        "restart",
        "reload",
        "enable",
        "disable",
        "list",
      ]),
      service: z.string().optional(),
    }),
    execute: async ({ action, service }) => {
      if (action !== "list" && !service) {
        return { success: false, error: "service required" };
      }
      const cmds: Record<string, string> = {
        status: `sudo systemctl status ${service} --no-pager`,
        start: `sudo systemctl start ${service}`,
        stop: `sudo systemctl stop ${service}`,
        restart: `sudo systemctl restart ${service}`,
        reload: `sudo systemctl reload ${service}`,
        enable: `sudo systemctl enable ${service}`,
        disable: `sudo systemctl disable ${service}`,
        list: "sudo systemctl list-units --type=service --state=running --no-pager",
      };
      const r = await sshExec(cmds[action], workDir(), 30_000);
      return {
        success: r.code === 0,
        action,
        service,
        output: (r.stdout + r.stderr).trim(),
      };
    },
  });

// =============================================================================
// SECTION 12 — DISK & CLEANUP
// =============================================================================

export const oracleSSHDiskCleanup = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Manage disk on the 1GB Oracle server: find large files, clean npm/apt/pm2 cache, remove old logs, check inode usage.",
    inputSchema: z.object({
      action: z.enum([
        "disk_usage",
        "large_files",
        "clean_npm",
        "clean_apt",
        "clean_pm2_logs",
        "clean_logs",
        "inode_usage",
        "dir_sizes",
      ]),
      path: z.string().optional(),
      size_threshold: z.string().optional().default("+10M"),
    }),
    execute: async ({ action, path: scanPath, size_threshold }) => {
      const target = scanPath || workDir();
      const cmds: Record<string, string> = {
        disk_usage:
          "df -h && echo '---' && du -sh /home/ubuntu/* 2>/dev/null | sort -hr | head -10",
        large_files: `sudo find ${target} -type f -size ${size_threshold} 2>/dev/null | xargs ls -lh 2>/dev/null | sort -k5 -hr | head -20`,
        clean_npm: "npm cache clean --force",
        clean_apt: "sudo apt-get autoremove -y && sudo apt-get autoclean",
        clean_pm2_logs: "pm2 flush && pm2 save",
        clean_logs:
          "sudo find /var/log -name '*.gz' -delete 2>/dev/null; sudo journalctl --vacuum-size=50M",
        inode_usage: "df -i /",
        dir_sizes: `du -sh ${target}/* 2>/dev/null | sort -hr | head -20`,
      };
      const r = await sshExec(cmds[action], workDir(), 60_000);
      return {
        success: r.code === 0,
        action,
        output: (r.stdout + r.stderr).trim(),
      };
    },
  });

// =============================================================================
// SECTION 13 — SSL (Let's Encrypt)
// =============================================================================

export const oracleSSHSSL = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Manage Let's Encrypt SSL certs via certbot: install certbot, issue, renew, status, list. Requires a domain pointing to the server.",
    inputSchema: z.object({
      action: z.enum(["install_certbot", "issue", "renew", "status", "list"]),
      domain: z.string().optional(),
      email: z.string().optional(),
    }),
    execute: async ({ action, domain, email }) => {
      if (action === "issue" && (!domain || !email)) {
        return { success: false, error: "domain and email required" };
      }
      const cmds: Record<string, string> = {
        install_certbot:
          "sudo apt-get install -y certbot python3-certbot-nginx",
        issue: `sudo certbot --nginx -d ${domain} --email ${email} --agree-tos --non-interactive`,
        renew: "sudo certbot renew --dry-run",
        status: "sudo certbot certificates",
        list: "sudo certbot certificates",
      };
      const r = await sshExec(cmds[action], workDir(), 120_000);
      return {
        success: r.code === 0,
        action,
        output: (r.stdout + r.stderr).trim(),
      };
    },
  });

// =============================================================================
// EXPORT ALL — 23 tools, 13 sections, 0 extra npm packages
// =============================================================================

export const allOracleTools = (ctx: { userId: string }) => ({
  oracleSSHExec: oracleSSHExec(ctx),
  oracleSSHExecMany: oracleSSHExecMany(ctx),
  oracleSSHReadFile: oracleSSHReadFile(ctx),
  oracleSSHWriteFile: oracleSSHWriteFile(ctx),
  oracleSSHListFiles: oracleSSHListFiles(ctx),
  oracleSSHFileOps: oracleSSHFileOps(ctx),
  oracleSSHUploadFile: oracleSSHUploadFile(ctx),
  oracleSSHPM2: oracleSSHPM2(ctx),
  oracleSSHDeploy: oracleSSHDeploy(ctx),
  oracleSSHGit: oracleSSHGit(ctx),
  oracleSSHSystemStats: oracleSSHSystemStats(ctx),
  oracleSSHTailLogs: oracleSSHTailLogs(ctx),
  oracleSSHNginx: oracleSSHNginx(ctx),
  oracleSSHEnvManager: oracleSSHEnvManager(ctx),
  oracleSSHCron: oracleSSHCron(ctx),
  oracleSSHNetwork: oracleSSHNetwork(ctx),
  oracleSSHPackages: oracleSSHPackages(ctx),
  oracleSSHService: oracleSSHService(ctx),
  oracleSSHDiskCleanup: oracleSSHDiskCleanup(ctx),
  oracleSSHSSL: oracleSSHSSL(ctx),
});

// =============================================================================
// TOOL INDEX
// =============================================================================
//
// EXECUTION        oracleSSHExec, oracleSSHExecMany
// FILES            oracleSSHReadFile, oracleSSHWriteFile, oracleSSHListFiles,
//                  oracleSSHFileOps (move/copy/delete/mkdir/chmod/chown), oracleSSHUploadFile
// PROCESSES        oracleSSHPM2 (status/restart/stop/start/delete/reload/logs/save/flush/describe)
// DEPLOYMENT       oracleSSHDeploy, oracleSSHGit
// MONITORING       oracleSSHSystemStats, oracleSSHTailLogs
// NGINX            oracleSSHNginx (status/test/reload/restart/get_config/set_config/add_site)
// ENV MANAGEMENT   oracleSSHEnvManager (read/list_keys/set/delete/backup)
// CRON             oracleSSHCron (list/add/remove/clear)
// NETWORK/FIREWALL oracleSSHNetwork (ports/ping/dns/curl/iptables)
// PACKAGES         oracleSSHPackages (apt install/remove/update/search)
// SYSTEMD          oracleSSHService (start/stop/restart/enable/disable/list)
// DISK/CLEANUP     oracleSSHDiskCleanup (usage/large_files/clean_*/)
// SSL              oracleSSHSSL (certbot issue/renew/status)
