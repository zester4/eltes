import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { createRequire } from 'module';

import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  validateCredentials,
  silentTokenRefresh,
  CredentialData
} from './modules/auth';

import {
  getConfig,
  saveConfig,
  setConfigKey,
  resetConfig,
  AppConfig
} from './modules/config';

import {
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  exportSession,
  Message,
  ChatSession
} from './modules/session';

import {
  listMemory,
  getMemory,
  setMemory,
  deleteMemory,
  clearMemory,
  generateMemoryDiff,
  loadMemory,
  MemoryDiff
} from './modules/memory';

import {
  AVAILABLE_SKILLS,
  getLoadedSkills,
  loadSkill,
  unloadSkill
} from './modules/skills';

import {
  AVAILABLE_TOOLS,
  inspectTool
} from './modules/tools';

import {
  SUBAGENT_DEFINITIONS,
  getSubAgentBySlug
} from './modules/agent-definitions';

import {
  renderMarkdown,
  initializeHighlighter
} from './utils/markdown';

import {
  runAgentSimulation,
  StreamEvent
} from './modules/agent';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

// Define Slash Commands List for Autocomplete
const SLASH_COMMANDS: string[] = [
  '/clear',
  '/export md',
  '/export json',
  '/export txt',
  '/subagents',
  '/subagent inspect ',
  '/memory list',
  '/memory get ',
  '/memory set ',
  '/memory delete ',
  '/skill list',
  '/skill load ',
  '/skill unload ',
  '/skill inspect ',
  '/tool list',
  '/tool inspect ',
  '/agent '
];

// Define interfaces for TUI State
export interface ToolState {
  name: string;
  icon: string;
  input: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed';
  stdout: string;
  output?: string;
}

export interface SubAgentState {
  id: string;
  name: string;
  role: string;
  status: 'running' | 'completed' | 'failed';
  depth: number;
  output?: string;
}

interface SelectItem {
  label: string;
  value: string;
}

// ----------------------------------------------------
// Terminal Utility Helpers
// ----------------------------------------------------

// Render click-to-open terminal hyperlinks (OSC 8)
export function terminalLink(text: string, url: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

// Trigger error beep / terminal bell
export function terminalBeep(): void {
  process.stdout.write('\x07');
}

// Copy a string of text to system clipboard
export function copyToClipboard(text: string): void {
  try {
    const cleanText = text.replace(/\x1b\[[0-9;]*m/g, ''); // strip ANSI escapes
    if (os.platform() === 'darwin') {
      const proc = spawn('pbcopy');
      proc.stdin.write(cleanText);
      proc.stdin.end();
    } else if (os.platform() === 'win32') {
      const proc = spawn('clip');
      proc.stdin.write(cleanText);
      proc.stdin.end();
    } else {
      const proc = spawn('xclip', ['-selection', 'clipboard']);
      proc.stdin.write(cleanText);
      proc.stdin.end();
    }
  } catch (e) {
    // Ignore clipboard failures gracefully
  }
}

// Send local system desktop notification
export function sendDesktopNotification(title: string, message: string): void {
  try {
    const cleanMsg = message.replace(/"/g, '\\"');
    if (os.platform() === 'darwin') {
      execSync(`osascript -e 'display notification "${cleanMsg}" with title "${title}"'`);
    } else if (os.platform() === 'linux') {
      execSync(`notify-send "${title}" "${cleanMsg}"`);
    }
  } catch (e) {
    // Fallback if notify-send / osascript is not available
  }
}

// Open URL in native default browser
export function openBrowser(url: string): void {
  try {
    if (os.platform() === 'darwin') {
      execSync(`open "${url}"`);
    } else if (os.platform() === 'win32') {
      execSync(`start "${url}"`);
    } else {
      execSync(`xdg-open "${url}"`);
    }
  } catch (e) {
    // Fail silently if browser cannot be opened
  }
}

// ----------------------------------------------------
// TUI Components
// ----------------------------------------------------

interface TUIProps {
  initialSessionId?: string;
  overrideAgent?: string;
  overrideModel?: string;
  debugMode?: boolean;
  noStream?: boolean;
  startConfigMode?: boolean;
}

function TUIApp({ initialSessionId, overrideAgent, overrideModel, debugMode, noStream, startConfigMode }: TUIProps) {
  const { exit } = useApp();
  const [credentials, setCredentials] = useState<CredentialData | null>(null);
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authStage, setAuthStage] = useState<'prompt' | 'device_code' | 'authenticating' | 'success' | 'error'>('prompt');

  // Device Code OAuth Flow State
  const [deviceUserCode, setDeviceUserCode] = useState<string>('');
  const [deviceVerificationUri, setDeviceVerificationUri] = useState<string>('');
  const [authError, setAuthError] = useState('');

  // Chat/Session State
  const [session, setSession] = useState<ChatSession | null>(null);
  const [activeAgentSlug, setActiveAgentSlug] = useState<string>(overrideAgent || config.defaultAgent);
  const [activeModel, setActiveModel] = useState<string>(overrideModel || config.defaultModel);
  const [latency] = useState<number>(config.latencySimulated);
  const [tokensUsed, setTokensUsed] = useState<number>(0);
  const [connectionState] = useState<'CONNECTED' | 'RECONNECTING' | 'OFFLINE'>('CONNECTED');
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(true);
  const [showSubagentsTree, setShowSubagentsTree] = useState<boolean>(true);

  // Input Composer State
  const [composerInput, setComposerInput] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [lastCtrlC, setLastCtrlC] = useState<number>(0);

  // Interactive Config Mode
  const [isConfigMode, setIsConfigMode] = useState<boolean>(!!startConfigMode);
  const [configStage, setConfigStage] = useState<'select_field' | 'edit_agent' | 'edit_model' | 'edit_stream' | 'edit_debug'>('select_field');
  const [tempConfig, setTempConfig] = useState<AppConfig>({ ...config });

  // Command Palette Overlay
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState<string>('');
  const [commandPaletteIdx, setCommandPaletteIdx] = useState<number>(0);

  // Streaming & Live Runs
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [activeTools, setActiveTools] = useState<ToolState[]>([]);
  const [subagentsTrace, setSubagentsTrace] = useState<SubAgentState[]>([]);
  const [memoryDiffLog, setMemoryDiffLog] = useState<MemoryDiff | null>(null);
  const [scrollOffset, setScrollOffset] = useState<number>(0);

  // Loaded Skills cached state
  const [loadedSkills, setLoadedSkills] = useState<string[]>(getLoadedSkills());

  // Bracketed Paste Mode effect
  useEffect(() => {
    // Enable bracketed paste mode in terminal
    process.stdout.write('\x1b[?2004h');
    initializeHighlighter();
    checkAuth();

    return () => {
      // Disable bracketed paste mode on exit
      process.stdout.write('\x1b[?2004l');
    };
  }, []);

  const checkAuth = async () => {
    const creds = await getCredentials();
    if (creds && creds.user) {
      // Refresh token silently
      const refreshed = await silentTokenRefresh(creds);
      setCredentials(refreshed);
      setIsAuthenticated(true);
      initializeSession();
    } else {
      setAuthStage('prompt');
    }
  };

  const initializeSession = () => {
    let currentSession: ChatSession;
    if (initialSessionId) {
      const res = getSession(initialSessionId);
      if (res) {
        currentSession = res;
      } else {
        currentSession = createNewSession();
      }
    } else {
      currentSession = createNewSession();
    }
    setSession(currentSession);
  };

  const createNewSession = (): ChatSession => {
    const newSession: ChatSession = {
      id: Math.random().toString(36).substring(2, 10).toUpperCase(),
      title: `Conversation with ${activeAgentSlug}`,
      agentSlug: activeAgentSlug,
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: 'welcome',
          role: 'system',
          content: `# Etles CLI Controller\nActive agent **${activeAgentSlug.toUpperCase()}** initialized and loaded with standard tools.\nHow can I support your project operations today?`,
          createdAt: new Date().toISOString()
        }
      ]
    };
    saveSession(newSession);
    return newSession;
  };

  // ----------------------------------------------------
  // OAuth Device Flow Trigger
  // ----------------------------------------------------
  const triggerDeviceFlowAuth = async () => {
    setAuthStage('device_code');
    const mockUserCode = 'ETLE-8842';
    const mockVerificationUri = 'https://etles.vercel.app/activate';

    setDeviceUserCode(mockUserCode);
    setDeviceVerificationUri(mockVerificationUri);

    // Attempt to open verification URL in browser
    openBrowser(`${mockVerificationUri}?code=${mockUserCode}`);

    // Poll endpoint simulation (success after 5s)
    setTimeout(async () => {
      setAuthStage('authenticating');
      const res = await validateCredentials(undefined, undefined, 'api-key-device-auth-code-token-value-1234');
      if (res.success && res.data) {
        await saveCredentials(res.data);
        setCredentials(res.data);
        setIsAuthenticated(true);
        initializeSession();
      } else {
        setAuthError('Device authorization polling expired or failed.');
        setAuthStage('prompt');
      }
    }, 5000);
  };

  // ----------------------------------------------------
  // Interactive Auth Flow Keyboard Handlers
  // ----------------------------------------------------
  const handleAuthInput = (input: string, key: { ctrl: boolean; upArrow: boolean; downArrow: boolean; tab: boolean; return: boolean; backspace: boolean }) => {
    if (key.ctrl && input === 'c') {
      exit();
      process.exit(0);
    }

    if (authStage === 'prompt') {
      if (key.return || input === '1') {
        triggerDeviceFlowAuth();
      }
    }
  };

  // ----------------------------------------------------
  // Interactive Composer / Main App Keyboard Handlers
  // ----------------------------------------------------
  const handleMainInput = (input: string, key: { ctrl: boolean; meta: boolean; upArrow: boolean; downArrow: boolean; tab: boolean; return: boolean; backspace: boolean; escape: boolean; shift: boolean }) => {
    // 2x Ctrl+C to Exit
    if (key.ctrl && input === 'c') {
      const now = Date.now();
      if (now - lastCtrlC < 1000) {
        exit();
        process.exit(0);
      } else {
        setLastCtrlC(now);
        return;
      }
    }

    // Capture Bracketed Paste Escape Sequence
    if (input.includes('\x1b[200~')) {
      const pastedText = input.replace('\x1b[200~', '').replace('\x1b[201~', '');
      setComposerInput(prev => prev + pastedText);
      return;
    }

    // Ctrl+P: Toggle Right Panel
    if (key.ctrl && input === 'p') {
      setRightPanelOpen(prev => !prev);
      return;
    }

    // Ctrl+L: Clear Viewport
    if (key.ctrl && input === 'l') {
      if (session) {
        const clearedSession = {
          ...session,
          messages: [{
            id: 'welcome',
            role: 'system' as const,
            content: 'Viewport cleared. Ready for operations.',
            createdAt: new Date().toISOString()
          }]
        };
        setSession(clearedSession);
        saveSession(clearedSession);
      }
      return;
    }

    // Ctrl+X: Interrupt Stream
    if (key.ctrl && input === 'x') {
      if (isStreaming) {
        setIsStreaming(false);
        setActiveTools([]);
        setSubagentsTrace([]);
        addMessageToSession('assistant', '⚠️ Streaming response interrupted by user.');
      }
      return;
    }

    // Ctrl+R: Retry Last Message
    if (key.ctrl && input === 'r') {
      if (session && session.messages.length > 1) {
        const userMsgs = session.messages.filter(m => m.role === 'user');
        if (userMsgs.length > 0) {
          const lastUserPrompt = userMsgs[userMsgs.length - 1].content;
          triggerAgentRun(lastUserPrompt);
        }
      }
      return;
    }

    // Ctrl+Y: Copy Latest Code Block to Clipboard
    if (key.ctrl && input === 'y') {
      if (session) {
        const assistants = session.messages.filter(m => m.role === 'assistant');
        if (assistants.length > 0) {
          const latest = assistants[assistants.length - 1].content;
          const match = latest.match(/```[a-z]*\n([\s\S]*?)```/);
          if (match) {
            copyToClipboard(match[1]);
            addMessageToSession('system', '✓ Copied code block to clipboard!');
          }
        }
      }
      return;
    }

    // Ctrl+E: Open in External $EDITOR (Vim, Nano) with raw mode release and restore
    if (key.ctrl && input === 'e') {
      const editor = process.env.EDITOR || 'nano';
      const tmpFile = path.join(os.tmpdir(), `etles-composer-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, composerInput, 'utf8');

      try {
        // Suspend raw mode and release stdin
        process.stdin.setRawMode(false);
        process.stdin.pause();

        // Spawn editor synchronously
        execSync(`${editor} ${tmpFile}`, { stdio: 'inherit' });

        // Resume raw mode and capture stdin back
        process.stdin.resume();
        process.stdin.setRawMode(true);

        const edited = fs.readFileSync(tmpFile, 'utf8');
        setComposerInput(edited.trim());
      } catch (e) {
        // Fallback cleanup raw-mode
        process.stdin.resume();
        process.stdin.setRawMode(true);
      } finally {
        try { fs.unlinkSync(tmpFile); } catch (e) {}
      }
      return;
    }

    // Ctrl+K: Command Palette toggle
    if (key.ctrl && input === 'k') {
      setCommandPaletteOpen(prev => !prev);
      setCommandPaletteQuery('');
      setCommandPaletteIdx(0);
      return;
    }

    // Command Palette Logic
    if (commandPaletteOpen) {
      const activeCommands = SUBAGENT_DEFINITIONS.map(a => `agent switch ${a.slug}`)
        .concat(AVAILABLE_SKILLS.map(s => `skill load ${s.slug}`))
        .concat(AVAILABLE_SKILLS.map(s => `skill unload ${s.slug}`))
        .filter(c => c.toLowerCase().includes(commandPaletteQuery.toLowerCase()));

      if (key.upArrow) {
        setCommandPaletteIdx(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setCommandPaletteIdx(prev => Math.min(activeCommands.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const cmd = activeCommands[commandPaletteIdx];
        if (cmd) {
          executeInlineSlashCommand('/' + cmd);
        }
        setCommandPaletteOpen(false);
        return;
      }
      if (key.escape) {
        setCommandPaletteOpen(false);
        return;
      }
      if (key.backspace) {
        setCommandPaletteQuery(prev => prev.slice(0, -1));
        return;
      }
      if (input) {
        setCommandPaletteQuery(prev => prev + input);
      }
      return;
    }

    // Autocomplete slash command logic (Tab)
    if (key.tab) {
      if (composerInput.startsWith('/')) {
        const matches = SLASH_COMMANDS.filter(cmd => cmd.startsWith(composerInput));
        if (matches.length > 0) {
          setComposerInput(matches[0]);
        }
      }
      return;
    }

    // History Navigation & Scrolling
    if (key.upArrow) {
      if (historyIdx === -1 && inputHistory.length > 0) {
        setHistoryIdx(inputHistory.length - 1);
        setComposerInput(inputHistory[inputHistory.length - 1]);
      } else if (historyIdx > 0) {
        setHistoryIdx(prev => prev - 1);
        setComposerInput(inputHistory[historyIdx - 1]);
      } else {
        // Scroll Viewport up
        setScrollOffset(prev => prev + 1);
      }
      return;
    }

    if (key.downArrow) {
      if (historyIdx !== -1 && historyIdx < inputHistory.length - 1) {
        setHistoryIdx(prev => prev + 1);
        setComposerInput(inputHistory[historyIdx + 1]);
      } else if (historyIdx === inputHistory.length - 1) {
        setHistoryIdx(-1);
        setComposerInput('');
      } else {
        // Scroll Viewport down
        setScrollOffset(prev => Math.max(0, prev - 1));
      }
      return;
    }
  };

  useInput((input, key) => {
    if (!isAuthenticated) {
      handleAuthInput(input, key);
    } else if (isConfigMode) {
      // Handled by SelectInput or Custom config menu keys
      if (key.ctrl && input === 'c') {
        exit();
        process.exit(0);
      }
    } else {
      handleMainInput(input, key);
    }
  });

  // Execute slash commands
  const executeInlineSlashCommand = (cmd: string) => {
    const parts = cmd.split(' ');
    const action = parts[0];
    const target = parts.slice(1).join(' ').trim();

    addMessageToSession('user', cmd);

    if (action === '/clear') {
      addMessageToSession('system', 'Viewport cleared.');
    } else if (action === '/export') {
      const format: 'md' | 'json' | 'txt' = (target === 'json' || target === 'md' || target === 'txt') ? target : 'md';
      if (session) {
        const exported = exportSession(session, format);
        const exportPath = path.join(os.homedir(), `etles-session-${session.id}.${format}`);
        fs.writeFileSync(exportPath, exported, 'utf8');
        addMessageToSession('system', `Session exported successfully to ${exportPath}`);
      }
    } else if (action === '/subagents') {
      setShowSubagentsTree(prev => !prev);
      addMessageToSession('system', `Sub-agent trace visibility toggled.`);
    } else if (action === '/subagent' && parts[1] === 'inspect') {
      const saId = parts[2];
      const trace = subagentsTrace.find(t => t.id === saId);
      if (trace) {
        addMessageToSession('system', `### Sub-agent Inspector [${trace.name}]\n- **Role:** ${trace.role}\n- **Status:** ${trace.status}\n- **Output:** ${trace.output || 'N/A'}`);
      } else {
        terminalBeep();
        addMessageToSession('system', `Sub-agent with ID "${saId}" not found in trace.`);
      }
    } else if (action === '/memory') {
      if (parts[1] === 'list') {
        const mem = listMemory();
        let md = `### Saved Long-term Memories\n\n`;
        md += `| Key | Type | Value | Updated |\n`;
        md += `| --- | --- | --- | --- |\n`;
        for (const m of mem) {
          md += `| \`${m.key}\` | ${m.type} | ${m.value} | ${new Date(m.updatedAt).toLocaleString()} |\n`;
        }
        addMessageToSession('system', md);
      } else if (parts[1] === 'get') {
        const val = getMemory(parts[2]);
        if (val) {
          addMessageToSession('system', `**Memory [${parts[2]}]:** ${val.value} (${val.type})`);
        } else {
          terminalBeep();
          addMessageToSession('system', `Memory key "${parts[2]}" not found.`);
        }
      } else if (parts[1] === 'set') {
        const key = parts[2];
        const val = parts.slice(3).join(' ');
        setMemory(key, val);
        addMessageToSession('system', `Successfully set memory key **${key}** to "${val}".`);
      } else if (parts[1] === 'delete') {
        const deleted = deleteMemory(parts[2]);
        if (deleted) {
          addMessageToSession('system', `Successfully deleted memory key **${parts[2]}**.`);
        } else {
          terminalBeep();
          addMessageToSession('system', `Memory key "${parts[2]}" not found.`);
        }
      }
    } else if (action === '/skill') {
      if (parts[1] === 'list') {
        let md = `### Skill Registry\n\n`;
        for (const s of AVAILABLE_SKILLS) {
          const isL = loadedSkills.includes(s.slug);
          md += `- **${s.name}** (\`${s.slug}\`) ${isL ? '\x1b[32m[LOADED]\x1b[0m' : ''}\n  - *Category:* ${s.category} | *Slots:* ${s.slots}\n  - *Description:* ${s.description}\n`;
        }
        addMessageToSession('system', md);
      } else if (parts[1] === 'load') {
        const res = loadSkill(parts[2]);
        if (res.success) {
          setLoadedSkills(getLoadedSkills());
          addMessageToSession('system', `✓ Loaded skill **${parts[2]}** successfully.`);
        } else {
          terminalBeep();
          addMessageToSession('system', `✗ Failed to load skill: ${res.error}`);
        }
      } else if (parts[1] === 'unload') {
        const res = unloadSkill(parts[2]);
        if (res.success) {
          setLoadedSkills(getLoadedSkills());
          addMessageToSession('system', `✓ Unloaded skill **${parts[2]}** successfully.`);
        } else {
          terminalBeep();
          addMessageToSession('system', `✗ Failed to unload skill: ${res.error}`);
        }
      } else if (parts[1] === 'inspect') {
        const s = AVAILABLE_SKILLS.find(x => x.slug === parts[2]);
        if (s) {
          addMessageToSession('system', `### Skill: ${s.name}\n- **Slug:** \`${s.slug}\`\n- **Category:** ${s.category}\n- **Slots Required:** ${s.slots}\n- **Enables Tools:** ${s.tools.join(', ')}\n- **Dependencies:** ${s.dependencies.join(', ') || 'None'}`);
        } else {
          terminalBeep();
          addMessageToSession('system', `Skill "${parts[2]}" not found.`);
        }
      }
    } else if (action === '/tool') {
      if (parts[1] === 'list') {
        let md = `### Tool Chest\n\n`;
        for (const t of AVAILABLE_TOOLS) {
          md += `- **${t.name}** ${t.icon}\n  - ${t.description}\n`;
        }
        addMessageToSession('system', md);
      } else if (parts[1] === 'inspect') {
        const t = inspectTool(parts[2]);
        if (t) {
          addMessageToSession('system', `### Tool Schema: ${t.name} ${t.icon}\n- **Description:** ${t.description}\n- **Input Properties:**\n\`\`\`json\n${JSON.stringify(t.schema, null, 2)}\n\`\`\``);
        } else {
          terminalBeep();
          addMessageToSession('system', `Tool "${parts[2]}" not found.`);
        }
      }
    } else if (action === '/agent') {
      const sub = SUBAGENT_DEFINITIONS.find(s => s.slug === target);
      if (sub) {
        setActiveAgentSlug(sub.slug);
        setConfigKey('defaultAgent', sub.slug);
        addMessageToSession('system', `Active controller switched to **${sub.name}**.`);
      } else {
        terminalBeep();
        addMessageToSession('system', `Agent with slug "${target}" not found.`);
      }
    } else {
      terminalBeep();
      addMessageToSession('system', `Unknown command. Type \`/help\` or use command palette (Ctrl+K).`);
    }
  };

  const addMessageToSession = (role: 'user' | 'assistant' | 'system', content: string) => {
    if (session) {
      const updated = {
        ...session,
        messages: [
          ...session.messages,
          {
            id: Math.random().toString(),
            role,
            content,
            createdAt: new Date().toISOString(),
            agentSlug: role === 'assistant' ? activeAgentSlug : undefined
          }
        ]
      };
      setSession(updated);
      saveSession(updated);
    }
  };

  const triggerAgentRun = async (prompt: string) => {
    if (isStreaming) return;
    setIsStreaming(true);

    // Reset streams state
    setActiveTools([]);
    setSubagentsTrace([]);
    setMemoryDiffLog(null);

    // 1. Add user message
    addMessageToSession('user', prompt);

    // 2. Add empty streaming placeholder message for assistant
    const msgId = Math.random().toString();
    const newMsg: Message = {
      id: msgId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      agentSlug: activeAgentSlug
    };

    setSession(prev => prev ? { ...prev, messages: [...prev.messages, newMsg] } : null);

    // 3. Start running simulation iterator
    const gen = runAgentSimulation(prompt, activeAgentSlug, loadedSkills);

    let fullContent = '';
    const runStep = () => {
      const res = gen.next();
      if (res.done) {
        setIsStreaming(false);
        setActiveTools([]);

        // Response complete - send local desktop notification if bg runs finished
        sendDesktopNotification(`Etles Agent: Response complete!`, `Finished running ${activeAgentSlug}`);
        return;
      }

      const ev = res.value as StreamEvent;
      if (ev.type === 'token') {
        const val = ev.data as string;
        fullContent += val;
        setTokensUsed(prev => prev + 8);
        setSession(prev => {
          if (!prev) return null;
          const updatedMsgs = prev.messages.map(m => m.id === msgId ? { ...m, content: fullContent } : m);
          const updated = { ...prev, messages: updatedMsgs };
          saveSession(updated);
          return updated;
        });
      } else if (ev.type === 'tool_start') {
        setActiveTools(prev => [...prev, { ...(ev.data as any), status: 'running', stdout: '' }]);
      } else if (ev.type === 'tool_stdout') {
        setActiveTools(prev => prev.map(t => t.name === 'shell_execute' ? { ...t, stdout: t.stdout + (ev.data as string) } : t));
      } else if (ev.type === 'tool_end') {
        const endData = ev.data as { name: string; status: 'completed' | 'failed'; output: string };
        setActiveTools(prev => prev.map(t => t.name === endData.name ? { ...t, status: endData.status, output: endData.output } : t));
      } else if (ev.type === 'subagent_start') {
        setSubagentsTrace(prev => [...prev, ev.data as any]);
      } else if (ev.type === 'subagent_end') {
        const saEnd = ev.data as { id: string; status: 'completed' | 'failed'; output: string };
        setSubagentsTrace(prev => prev.map(s => s.id === saEnd.id ? { ...s, status: saEnd.status, output: saEnd.output } : s));
      } else if (ev.type === 'memory_update') {
        const memData = ev.data as { oldMemory: any; newMemory: any };
        const diff = generateMemoryDiff(memData.oldMemory, memData.newMemory);
        setMemoryDiffLog(diff);
      }

      // Chain using setTimeout for asynchronous character flow
      setTimeout(runStep, 150);
    };

    setTimeout(runStep, 200);
  };

  // ----------------------------------------------------
  // Interactive Config Form Menus Handlers
  // ----------------------------------------------------
  const handleConfigFieldSelect = (item: SelectItem) => {
    if (item.value === 'save') {
      saveConfig(tempConfig);
      setConfig(tempConfig);
      setIsConfigMode(false);
    } else if (item.value === 'cancel') {
      setIsConfigMode(false);
    } else if (item.value === 'defaultAgent') {
      setConfigStage('edit_agent');
    } else if (item.value === 'defaultModel') {
      setConfigStage('edit_model');
    } else if (item.value === 'stream') {
      setConfigStage('edit_stream');
    } else if (item.value === 'debug') {
      setConfigStage('edit_debug');
    }
  };

  const handleAgentSelect = (item: SelectItem) => {
    setTempConfig(prev => ({ ...prev, defaultAgent: item.value }));
    setConfigStage('select_field');
  };

  const handleModelSelect = (item: SelectItem) => {
    setTempConfig(prev => ({ ...prev, defaultModel: item.value }));
    setConfigStage('select_field');
  };

  const handleStreamSelect = (item: SelectItem) => {
    setTempConfig(prev => ({ ...prev, stream: item.value === 'true' }));
    setConfigStage('select_field');
  };

  const handleDebugSelect = (item: SelectItem) => {
    setTempConfig(prev => ({ ...prev, debug: item.value === 'true' }));
    setConfigStage('select_field');
  };

  // ----------------------------------------------------
  // Layout Rendering
  // ----------------------------------------------------

  // Render Auth View with Device Code OAuth Flow
  if (!isAuthenticated) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1} width={80}>
        <Text bold color="cyan">ETLES AUTONOMOUS AGENT CONTROLLER (AUTH REQUIRED)</Text>
        <Text color="grey">Terminal secure credentials lock is currently active.</Text>
        <Box marginY={1}/>

        {authStage === 'prompt' && (
          <Box flexDirection="column">
            <Text color="yellow">Select your authentication mode:</Text>
            <Box marginY={1} />
            <Text>  Press [ENTER] to sign in with GitHub-style Browser OAuth Device Flow</Text>
            <Box marginY={1}/>
            <Text color="grey">Press ENTER key to proceed...</Text>
          </Box>
        )}

        {authStage === 'device_code' && (
          <Box flexDirection="column">
            <Text bold color="yellow">OAUTH DEVICE FLOW ACTIVATED</Text>
            <Box marginY={1} />
            <Text>Please navigate your browser to register this device:</Text>
            <Text bold color="cyan">  {deviceVerificationUri}</Text>
            <Box marginY={1} />
            <Text>And enter the unique verification code:</Text>
            <Text bold color="green">  {deviceUserCode}</Text>
            <Box marginY={1} />
            <Text color="grey">Attempting to launch browser automatically. Poll server is active...</Text>
            <Box marginY={1} />
            <Box>
              <Spinner color="yellow" />
              <Text color="grey"> Polling secure token service...</Text>
            </Box>
          </Box>
        )}

        {authStage === 'authenticating' && (
          <Box>
            <Spinner color="cyan" />
            <Text color="cyan"> Auth registration confirmed! Retrieving credentials...</Text>
          </Box>
        )}

        {authError && (
          <Box marginY={1}>
            <Text color="red">Error: {authError}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Render Interactive Config TUI Mode
  if (isConfigMode) {
    const configItems: SelectItem[] = [
      { label: `Default Agent: ${tempConfig.defaultAgent}`, value: 'defaultAgent' },
      { label: `Default Model: ${tempConfig.defaultModel}`, value: 'defaultModel' },
      { label: `Streaming Mode: ${tempConfig.stream ? 'Enabled' : 'Disabled'}`, value: 'stream' },
      { label: `Debug Mode: ${tempConfig.debug ? 'Enabled' : 'Disabled'}`, value: 'debug' },
      { label: '✔ [ Save & Apply Defaults ]', value: 'save' },
      { label: '✗ [ Cancel / Exit ]', value: 'cancel' }
    ];

    const agentItems: SelectItem[] = SUBAGENT_DEFINITIONS.map(a => ({ label: a.name, value: a.slug }));
    const modelItems: SelectItem[] = [
      { label: 'Gemini 3.5 Pro', value: 'gemini-3.5-pro' },
      { label: 'Gemini 3.5 Flash', value: 'gemini-3.5-flash' },
      { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet' },
      { label: 'GPT-4o Mini', value: 'gpt-4o-mini' }
    ];
    const streamItems: SelectItem[] = [
      { label: 'Enable Character Streaming', value: 'true' },
      { label: 'Disable Streaming (Flush responses)', value: 'false' }
    ];
    const debugItems: SelectItem[] = [
      { label: 'Enable Debug Payloads Logging', value: 'true' },
      { label: 'Disable Debug Logs', value: 'false' }
    ];

    return (
      <Box flexDirection="column" borderStyle="single" borderColor="yellow" padding={1} width={80}>
        <Text bold color="yellow">⚙ ETLES INTERACTIVE CONFIGURATION FORM</Text>
        <Text color="grey">Press Enter to select, use Up/Down arrows to navigate.</Text>
        <Box marginY={1} />

        {configStage === 'select_field' && (
          <SelectInput items={configItems} onSelect={handleConfigFieldSelect} />
        )}

        {configStage === 'edit_agent' && (
          <Box flexDirection="column">
            <Text color="cyan">Select Default Active Agent:</Text>
            <SelectInput items={agentItems} onSelect={handleAgentSelect} />
          </Box>
        )}

        {configStage === 'edit_model' && (
          <Box flexDirection="column">
            <Text color="cyan">Select Primary Large Language Model:</Text>
            <SelectInput items={modelItems} onSelect={handleModelSelect} />
          </Box>
        )}

        {configStage === 'edit_stream' && (
          <Box flexDirection="column">
            <Text color="cyan">Configure Streaming Response:</Text>
            <SelectInput items={streamItems} onSelect={handleStreamSelect} />
          </Box>
        )}

        {configStage === 'edit_debug' && (
          <Box flexDirection="column">
            <Text color="cyan">Configure Debug Mode:</Text>
            <SelectInput items={debugItems} onSelect={handleDebugSelect} />
          </Box>
        )}
      </Box>
    );
  }

  // Render Command Palette Overlay
  const renderCommandPalette = () => {
    const activeCommands = SUBAGENT_DEFINITIONS.map(a => `agent switch ${a.slug}`)
      .concat(AVAILABLE_SKILLS.map(s => `skill load ${s.slug}`))
      .concat(AVAILABLE_SKILLS.map(s => `skill unload ${s.slug}`))
      .filter(c => c.toLowerCase().includes(commandPaletteQuery.toLowerCase()));

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} width={76} marginX={2}>
        <Text bold color="yellow">COMMAND PALETTE</Text>
        <Box>
          <Text color="grey">Query: </Text>
          <Text>{commandPaletteQuery}█</Text>
        </Box>
        <Box marginY={1} borderStyle="single" borderColor="grey" flexDirection="column" height={6}>
          {activeCommands.slice(0, 5).map((cmd, idx) => (
            <Text key={cmd} color={idx === commandPaletteIdx ? 'cyan' : 'white'}>
              {idx === commandPaletteIdx ? '> ' : '  '}{cmd}
            </Text>
          ))}
          {activeCommands.length === 0 && <Text color="grey">No commands match your query.</Text>}
        </Box>
        <Text color="grey" size="small">Use Up/Down arrows to select, Enter to execute, Esc to exit</Text>
      </Box>
    );
  };

  // Render Main Layout (with Toggleable Right Panel)
  return (
    <Box flexDirection="column" width={100} height={30} borderStyle="single" borderColor="grey">

      {/* 1. Header/Top status bar */}
      <Box justifyContent="space-between" borderStyle="single" borderColor="grey" paddingX={1} height={3}>
        <Text bold color="cyan">⚡ ETLES PRO v{packageJson.version}</Text>
        <Box>
          <Text color="grey">Agent: </Text>
          <Text color="green">{activeAgentSlug} </Text>
          <Text color="grey">| Model: </Text>
          <Text color="yellow">{activeModel} </Text>
          <Text color="grey">| Latency: </Text>
          <Text color="magenta">{latency}ms </Text>
          <Text color="grey">| Tokens: </Text>
          <Text color="white">{tokensUsed}</Text>
        </Box>
      </Box>

      {/* 2. Middle Panels Viewport */}
      <Box flexGrow={1} flexDirection="row">

        {/* Main Viewport (Left panel) */}
        <Box flexGrow={1} flexDirection="column" padding={1} borderStyle="single" borderColor="grey">
          {commandPaletteOpen ? (
            renderCommandPalette()
          ) : (
            <Box flexDirection="column" flexGrow={1}>
              {session && session.messages.slice(Math.max(0, session.messages.length - 8 + scrollOffset)).map((msg, idx) => {
                const isUser = msg.role === 'user';
                const isSystem = msg.role === 'system';
                const accentColor = isUser ? 'cyan' : isSystem ? 'grey' : 'green';
                const author = isUser ? 'User' : isSystem ? 'SYSTEM' : `Agent [${msg.agentSlug || activeAgentSlug}]`;

                return (
                  <Box key={msg.id || idx} flexDirection="column" marginBottom={1}>
                    <Text bold color={accentColor}>◆ {author} • {new Date(msg.createdAt).toLocaleTimeString()}</Text>
                    <Text>{renderMarkdown(msg.content, 65)}</Text>
                  </Box>
                );
              })}

              {/* Live Card: Active Tools */}
              {activeTools.length > 0 && (
                <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1} marginY={1}>
                  {activeTools.map((t, idx) => (
                    <Box key={idx} flexDirection="column">
                      <Box justifyContent="space-between">
                        <Text bold color="yellow">{t.icon} Tool: {t.name}</Text>
                        <Box>
                          {t.status === 'running' ? (
                            <Box><Spinner color="yellow" /><Text color="yellow"> executing...</Text></Box>
                          ) : (
                            <Text color="green">✓ complete</Text>
                          )}
                        </Box>
                      </Box>
                      <Text color="grey">Input params: {JSON.stringify(t.input)}</Text>
                      {t.stdout && (
                        <Box marginY={1} borderStyle="single" borderColor="grey" paddingX={1}>
                          <Text color="grey">{t.stdout}</Text>
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Right Panel (Inspector View) */}
        {rightPanelOpen && (
          <Box width={34} flexDirection="column" borderStyle="single" borderColor="grey" padding={1}>
            <Text bold color="cyan">👁 AGENT INSPECTOR</Text>
            <Text color="grey">────────────────────────────────</Text>

            {/* Sub-agents tree */}
            {showSubagentsTree && subagentsTrace.length > 0 && (
              <Box flexDirection="column" marginY={1}>
                <Text bold color="magenta">🌳 SUB-AGENTS TREE</Text>
                {subagentsTrace.map((sa) => (
                  <Text key={sa.id} color={sa.status === 'running' ? 'yellow' : 'green'}>
                    {'  '.repeat(sa.depth)}{sa.status === 'running' ? '⠋' : '✓'} {sa.name} ({sa.role})
                  </Text>
                ))}
              </Box>
            )}

            {/* Memory state */}
            <Box flexDirection="column" marginY={1}>
              <Text bold color="yellow">💾 LONG-TERM MEMORY</Text>
              {listMemory().slice(0, 3).map((m) => (
                <Text key={m.key} color="white">
                  • {m.key}: <Text color="grey">{m.value}</Text>
                </Text>
              ))}
              {listMemory().length === 0 && <Text color="grey">Empty (no memories yet)</Text>}

              {/* Memory Live Diff display */}
              {memoryDiffLog && (
                <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginY={1}>
                  <Text bold color="yellow">Memory Diff Log:</Text>
                  {memoryDiffLog.written.map((w) => (
                    <Text key={w.key} color="green">+ [written] {w.key}: {w.value}</Text>
                  ))}
                  {memoryDiffLog.updated.map((u) => (
                    <Text key={u.key} color="blue">~ [updated] {u.key}: {u.oldValue} {"->"} {u.newValue}</Text>
                  ))}
                  {memoryDiffLog.deleted.map((d) => (
                    <Text key={d.key} color="red">- [deleted] {d.key}</Text>
                  ))}
                </Box>
              )}
            </Box>

            {/* Loaded skills slots */}
            <Box flexDirection="column" marginY={1}>
              <Text bold color="green">⚡ SKILL SLOTS [4 MAX]</Text>
              {loadedSkills.map((slug) => {
                const s = AVAILABLE_SKILLS.find(x => x.slug === slug);
                return (
                  <Text key={slug} color="green">
                    [■] {s ? s.name : slug}
                  </Text>
                );
              })}
              {loadedSkills.length === 0 && <Text color="grey">No loaded skills in slots</Text>}
            </Box>
          </Box>
        )}

      </Box>

      {/* 3. Bottom Composer Panel */}
      <Box flexDirection="column" borderStyle="single" borderColor="grey">
        {/* Autocomplete Bar */}
        {composerInput.startsWith('/') && (
          <Box paddingX={1} justifyContent="flex-start">
            <Text color="grey">Autocomplete: </Text>
            {SLASH_COMMANDS.filter(c => c.startsWith(composerInput)).slice(0, 4).map((c) => (
              <Text key={c} color="yellow"> [{c}] </Text>
            ))}
          </Box>
        )}

        {/* Input area using ink-text-input for premium editing */}
        <Box paddingX={1} height={2}>
          <Text color="cyan" bold>{'❯ '}</Text>
          <TextInput
            value={composerInput}
            onChange={setComposerInput}
            onSubmit={(val) => {
              const cleaned = val.trim();
              if (cleaned) {
                setInputHistory(prev => [...prev, cleaned]);
                setHistoryIdx(-1);
                setComposerInput('');
                setScrollOffset(0);

                if (cleaned.startsWith('/')) {
                  executeInlineSlashCommand(cleaned);
                } else {
                  triggerAgentRun(cleaned);
                }
              }
            }}
          />
        </Box>

        {/* Status bar */}
        <Box justifyContent="space-between" paddingX={1} height={1} backgroundColor="grey">
          <Text color="black" bold>Session ID: {session ? session.id : 'N/A'} | Conn: {connectionState}</Text>
          <Text color="black">Ctrl+P Panel | Ctrl+K Palette | Ctrl+Y Copy | Ctrl+E Editor | Ctrl+X Stop</Text>
        </Box>
      </Box>

    </Box>
  );
}

// ----------------------------------------------------
// Standalone Non-Interactive Commands
// ----------------------------------------------------

async function runOneShotMode(prompt: string, agentSlug?: string, modelOverride?: string) {
  const config = getConfig();
  const slug = agentSlug || config.defaultAgent;
  const model = modelOverride || config.defaultModel;

  const agent = SUBAGENT_DEFINITIONS.find(a => a.slug === slug) || SUBAGENT_DEFINITIONS[0];
  console.log(`\x1b[1;36mETLES AUTONOMOUS CONTROLLER: ONE-SHOT RUN\x1b[0m`);
  console.log(`\x1b[90mAgent: ${agent.name} | Model: ${model}\x1b[0m\n`);

  const gen = runAgentSimulation(prompt, slug, getLoadedSkills());

  for (const ev of gen) {
    if (ev.type === 'token') {
      process.stdout.write(ev.data as string);
    } else if (ev.type === 'tool_start') {
      const startData = ev.data as { name: string; icon: string };
      console.log(`\n\x1b[1;33m[Tool Invocation] ${startData.icon} ${startData.name} Starting...\x1b[0m`);
    } else if (ev.type === 'tool_stdout') {
      process.stdout.write(ev.data as string);
    } else if (ev.type === 'tool_end') {
      const endData = ev.data as { name: string; status: string; output: string };
      console.log(`\x1b[1;32m[Tool End] ${endData.name}: ${endData.status} (${endData.output})\x1b[0m\n`);
    } else if (ev.type === 'subagent_start') {
      const saStart = ev.data as { name: string; role: string };
      console.log(`\x1b[35m[Sub-agent Spawning] ${saStart.name} (Role: ${saStart.role})\x1b[0m`);
    } else if (ev.type === 'subagent_end') {
      const saEnd = ev.data as { name: string; status: string; output: string };
      console.log(`\x1b[32m[Sub-agent Finished] ${saEnd.name}: ${saEnd.status} (${saEnd.output})\x1b[0m`);
    } else if (ev.type === 'memory_update') {
      const memData = ev.data as { oldMemory: any; newMemory: any };
      const diff = generateMemoryDiff(memData.oldMemory, memData.newMemory);
      console.log(`\n\x1b[1;33m[Memory Diff Saved]\x1b[0m`);
      for (const w of diff.written) console.log(`  + ${w.key}: ${w.value}`);
      for (const u of diff.updated) console.log(`  ~ ${u.key}: ${u.oldValue} -> ${u.newValue}`);
      for (const d of diff.deleted) console.log(`  - ${d.key}`);
    }
  }
}

// ----------------------------------------------------
// Main Entrypoint (Commander CLI Parser)
// ----------------------------------------------------

async function main() {
  const program = new Command();
  program
    .name('agent')
    .description('Etles Powerful Production-grade CLI Agent TUI Interface')
    .version(packageJson.version);

  // Default interactive TUI mode
  program
    .command('chat', { isDefault: true })
    .description('Launch the fully interactive multi-pane terminal user interface (TUI)')
    .option('--resume <sessionId>', 'Resume a past conversation log')
    .option('--agent <name>', 'Override active default agent')
    .option('--model <name>', 'Override active default model')
    .option('--debug', 'Enable debug payloads logger')
    .option('--no-stream', 'Disable real-time streaming response')
    .action((opts) => {
      render(
        <TUIApp
          initialSessionId={opts.resume}
          overrideAgent={opts.agent}
          overrideModel={opts.model}
          debugMode={opts.debug}
          noStream={opts.noStream}
        />
      );
    });

  // Login
  program
    .command('login')
    .description('Interactively log into Etles account credentials or configure API key')
    .action(() => {
      render(<TUIApp />);
    });

  // Logout
  program
    .command('logout')
    .description('Clear secure keychain and local terminal session authentication')
    .action(async () => {
      await deleteCredentials();
      console.log('\x1b[32mSuccessfully logged out and wiped local credentials keychain.\x1b[0m');
      process.exit(0);
    });

  // Whoami
  program
    .command('whoami')
    .description('Display currently active credentials, user workspace, and role')
    .action(async () => {
      const creds = await getCredentials();
      if (creds && creds.user) {
        console.log(`\x1b[1;36mAUTHENTICATED IDENTITY:\x1b[0m`);
        console.log(`- User Name: ${creds.user.name}`);
        console.log(`- Email ID: ${creds.user.email}`);
        console.log(`- Account Role: ${creds.user.role}`);
        console.log(`- Workspace: ${creds.user.workspace}`);
        if (creds.apiKey) {
          console.log(`- Auth Method: GitHub Browser OAuth Device Flow`);
        } else {
          console.log(`- Auth Method: Secure Session Token`);
        }
      } else {
        console.log('\x1b[31mNot authenticated. Run "agent login" to authenticate.\x1b[0m');
      }
      process.exit(0);
    });

  // One-shot run command
  program
    .command('run <prompt>')
    .description('Execute a single streaming agent run in non-interactive stdout mode')
    .option('--agent <name>', 'Override default agent for this prompt')
    .option('--model <name>', 'Override default model for this prompt')
    .action(async (prompt, opts) => {
      await runOneShotMode(prompt, opts.agent, opts.model);
      process.exit(0);
    });

  // List all available agents
  program
    .command('list')
    .description('Browse all available Etles agents, system definitions, and descriptions')
    .action(() => {
      console.log(`\x1b[1;36mAVAILABLE AUTONOMOUS AGENTS:\x1b[0m\n`);
      for (const a of SUBAGENT_DEFINITIONS) {
        console.log(`• \x1b[1;32m${a.slug}\x1b[0m - ${a.name}`);
        console.log(`  Description: ${a.description}`);
        console.log(`  Toolkits: [${a.toolkits.slice(0, 5).join(', ')}...]\n`);
      }
      process.exit(0);
    });

  // Switch agent command
  program
    .command('switch <name>')
    .description('Hot-swap the active global default agent')
    .action((name) => {
      const agent = getSubAgentBySlug(name);
      if (agent) {
        setConfigKey('defaultAgent', name);
        console.log(`\x1b[32mSuccessfully switched default agent to: ${agent.name} (${agent.slug})\x1b[0m`);
      } else {
        console.log(`\x1b[31mError: Agent "${name}" not found.\x1b[0m`);
      }
      process.exit(0);
    });

  // Inspect agent details
  program
    .command('inspect <name>')
    .description('Display detailed system parameters, tools list, and definitions for an agent')
    .action((name) => {
      const agent = getSubAgentBySlug(name);
      if (agent) {
        console.log(`\x1b[1;36mINSPECTING AGENT: ${agent.name} (${agent.slug})\x1b[0m`);
        console.log(`- Description: ${agent.description}`);
        console.log(`- Toolkits:`);
        for (const t of agent.toolkits) {
          console.log(`  • ${t}`);
        }
        console.log(`- System Prompt:\n\x1b[90m${agent.systemPrompt}\x1b[0m`);
      } else {
        console.log(`\x1b[31mError: Agent "${name}" not found.\x1b[0m`);
      }
      process.exit(0);
    });

  // Memory commands
  const memoryCmd = program.command('memory').description('Manage long-term semantic memory entries');

  memoryCmd
    .command('list')
    .description('Show paginated catalog table of all memories')
    .action(() => {
      const mem = listMemory();
      console.log(`\x1b[1;36mSAVED SEMANTIC MEMORIES:\x1b[0m`);
      console.table(mem.map(m => ({ Key: m.key, Type: m.type, Value: m.value, Updated: new Date(m.updatedAt).toLocaleString() })));
      process.exit(0);
    });

  memoryCmd
    .command('get <key>')
    .description('Retrieve exact value of a memory key')
    .action((key) => {
      const val = getMemory(key);
      if (val) {
        console.log(`\x1b[32m[Memory Found] \x1b[1m${key}\x1b[22m: ${val.value} (${val.type})\x1b[0m`);
      } else {
        console.log(`\x1b[31mMemory key "${key}" not found.\x1b[0m`);
      }
      process.exit(0);
    });

  memoryCmd
    .command('set <key> <value>')
    .description('Save or update a memory key with value')
    .action((key, value) => {
      const res = setMemory(key, value);
      console.log(`\x1b[32mSuccessfully ${res.action === 'write' ? 'created' : 'updated'} memory key "${key}" to "${value}".\x1b[0m`);
      process.exit(0);
    });

  memoryCmd
    .command('delete <key>')
    .description('Permanently delete a memory key')
    .action((key) => {
      const deleted = deleteMemory(key);
      if (deleted) {
        console.log(`\x1b[32mSuccessfully deleted memory key "${key}".\x1b[0m`);
      } else {
        console.log(`\x1b[31mMemory key "${key}" not found.\x1b[0m`);
      }
      process.exit(0);
    });

  memoryCmd
    .command('clear')
    .description('Wipe all long-term semantic memory databases')
    .action(() => {
      clearMemory();
      console.log('\x1b[32mSuccessfully wiped all memory keys.\x1b[0m');
      process.exit(0);
    });

  // Tool commands
  const toolCmd = program.command('tool').description('Manage, inspect and trigger custom tools');

  toolCmd
    .command('list')
    .description('List all registered local workspace tools')
    .action(() => {
      console.log(`\x1b[1;36mWORKSPACE TOOL CHEST:\x1b[0m\n`);
      for (const t of AVAILABLE_TOOLS) {
        console.log(`• \x1b[1;32m${t.name}\x1b[0m ${t.icon} - ${t.description}`);
      }
      process.exit(0);
    });

  toolCmd
    .command('inspect <name>')
    .description('Inspect the JSON-Schema arguments representation of a tool')
    .action((name) => {
      const t = inspectTool(name);
      if (t) {
        console.log(`\x1b[1;36mTOOL SCHEMA: ${t.name} ${t.icon}\x1b[0m`);
        console.log(`- Description: ${t.description}`);
        console.log(`- Parameters schema:`);
        console.log(JSON.stringify(t.schema, null, 2));
        console.log(`- Example Invocation Input:`);
        console.log(JSON.stringify(t.exampleInput, null, 2));
      } else {
        console.log(`\x1b[31mTool "${name}" not found.\x1b[0m`);
      }
      process.exit(0);
    });

  // Skill commands
  const skillCmd = program.command('skill').description('Activate, deactivate and browse skill libraries');

  skillCmd
    .command('list')
    .description('Browse skill library, categories, and slots availability')
    .action(() => {
      const loaded = getLoadedSkills();
      console.log(`\x1b[1;36mSKILL LIBRARIES:\x1b[0m\n`);
      for (const s of AVAILABLE_SKILLS) {
        const isL = loaded.includes(s.slug);
        console.log(`• \x1b[1;32m${s.name}\x1b[0m (\`${s.slug}\`) ${isL ? '\x1b[32m[ACTIVE]\x1b[0m' : ''}`);
        console.log(`  Description: ${s.description}`);
        console.log(`  Category: ${s.category} | Slots: ${s.slots}`);
        console.log(`  Enables Tools: [${s.tools.join(', ')}]`);
        console.log(`  Dependencies: [${s.dependencies.join(', ') || 'None'}]\n`);
      }
      process.exit(0);
    });

  skillCmd
    .command('load <name>')
    .description('Activate a skill with live verification and load to active slot')
    .action((name) => {
      const res = loadSkill(name);
      if (res.success) {
        console.log(`\x1b[32mSuccessfully loaded skill: "${name}". Slot allocated.\x1b[0m`);
      } else {
        console.log(`\x1b[31mError loading skill: ${res.error}\x1b[0m`);
      }
      process.exit(0);
    });

  skillCmd
    .command('unload <name>')
    .description('Unload an active skill and reclaim slot resource')
    .action((name) => {
      const res = unloadSkill(name);
      if (res.success) {
        console.log(`\x1b[32mSuccessfully unloaded skill: "${name}". Slot reclaimed.\x1b[0m`);
      } else {
        console.log(`\x1b[31mError unloading skill: ${res.error}\x1b[0m`);
      }
      process.exit(0);
    });

  skillCmd
    .command('inspect <name>')
    .description('Display dependencies and tools definition of a skill')
    .action((name) => {
      const s = AVAILABLE_SKILLS.find(x => x.slug === name);
      if (s) {
        console.log(`\x1b[1;36mSKILL DEFINITION: ${s.name}\x1b[0m`);
        console.log(`- Slug: ${s.slug}`);
        console.log(`- Category: ${s.category}`);
        console.log(`- Description: ${s.description}`);
        console.log(`- Space Requirement: ${s.slots} Slot(s)`);
        console.log(`- Target Tools Enabled: ${s.tools.join(', ')}`);
        console.log(`- System Environment Dependencies: ${s.dependencies.join(', ') || 'None'}`);
      } else {
        console.log(`\x1b[31mSkill "${name}" not found.\x1b[0m`);
      }
      process.exit(0);
    });

  // Sessions management commands
  const sessionCmd = program.command('session').description('Manage conversation logs history');

  sessionCmd
    .command('list')
    .description('Print table of all past sessions and timelines')
    .action(() => {
      const list = listSessions();
      console.log(`\x1b[1;36mCONVERSATIONS HISTORY LOGS:\x1b[0m`);
      console.table(list.map(s => ({ ID: s.id, Title: s.title, Agent: s.agentSlug, Created: new Date(s.createdAt).toLocaleString(), Messages: s.messages.length })));
      process.exit(0);
    });

  sessionCmd
    .command('resume <id>')
    .description('Resume a past conversation logs in TUI view')
    .action((id) => {
      render(<TUIApp initialSessionId={id} />);
    });

  sessionCmd
    .command('delete <id>')
    .description('Delete a session from history completely')
    .action((id) => {
      const ok = deleteSession(id);
      if (ok) {
        console.log(`\x1b[32mSuccessfully deleted session: ${id}.\x1b[0m`);
      } else {
        console.log(`\x1b[31mSession ${id} not found.\x1b[0m`);
      }
      process.exit(0);
    });

  sessionCmd
    .command('export <id> [format]')
    .description('Export session log to file format (md, json, txt)')
    .action((id, format) => {
      const s = getSession(id);
      if (s) {
        const fmt: 'md' | 'json' | 'txt' = (format === 'json' || format === 'md' || format === 'txt') ? format : 'md';
        const content = exportSession(s, fmt);
        const outPath = path.join(os.homedir(), `exported-session-${id}.${fmt}`);
        fs.writeFileSync(outPath, content, 'utf8');
        console.log(`\x1b[32mSession ${id} successfully exported and written to ${outPath}\x1b[0m`);
      } else {
        console.log(`\x1b[31mSession ${id} not found.\x1b[0m`);
      }
      process.exit(0);
    });

  // Config Commands
  const configCmd = program.command('config').description('Configure controller options and settings interactive/non-interactive');

  // Trigger interactive TUI config form
  configCmd
    .action(() => {
      render(<TUIApp startConfigMode={true} />);
    });

  configCmd
    .command('set <key> <value>')
    .description('Non-interactive configuration key update')
    .action((key, value) => {
      const current = getConfig();
      if (key in current) {
        let parsedVal: unknown = value;
        if (value === 'true') parsedVal = true;
        if (value === 'false') parsedVal = false;
        if (!isNaN(Number(value))) parsedVal = Number(value);

        setConfigKey(key as keyof AppConfig, parsedVal as boolean & number & string);
        console.log(`\x1b[32mConfigured "${key}" updated successfully to "${value}".\x1b[0m`);
      } else {
        console.log(`\x1b[31mConfiguration option "${key}" does not exist.\x1b[0m`);
      }
      process.exit(0);
    });

  configCmd
    .command('get <key>')
    .description('Print the currently active configuration option')
    .action((key) => {
      const current = getConfig();
      if (key in current) {
        console.log(`${key}: ${(current as Record<string, unknown>)[key]}`);
      } else {
        console.log(`\x1b[31mConfiguration option "${key}" does not exist.\x1b[0m`);
      }
      process.exit(0);
    });

  configCmd
    .command('reset')
    .description('Reset all terminal interface configurations to system default')
    .action(() => {
      resetConfig();
      console.log('\x1b[32mConfigurations successfully restored to system factory defaults.\x1b[0m');
      process.exit(0);
    });

  program.parse(process.argv);
}

main().catch(err => {
  console.error('\x1b[31mCritical Error in CLI agent launcher:\x1b[0m', err);
  process.exit(1);
});
