# Product gaps & roadmap notes

## Agent activity (done)

- **Settings → Agent activity** (`/settings/agents`): full history of sub-agent runs, status, snippets, link to chat.
- Sidebar pulse + chat banner for **active** runs.

## Charts in chat (done)

- **Tool:** `renderChart` (`lib/ai/tools/render-chart.ts`) — Zod-validated payload: `line` | `bar` | `area` | `pie` | `radar` | `scatter` | `composed`.
- **UI:** `components/elements/chart-display.tsx` — **Recharts** + `ResponsiveContainer`, theme-aware grid/axes, 12-color default palette, mobile-friendly height (`min-h` + `min(52vh, 340px)`).
- **Chat:** `message.tsx` renders `tool-renderChart` like weather; model is instructed in `lib/ai/prompts.ts`.

Optional later: stream partial chart config for progressive display.

## Other common gaps

- **Voice I/O**: no STT/TTS in the chat shell.
- **Telegram**: no interactive inline keyboards for approvals (web chat has tool approval UI).
- **Exports**: no “export conversation to PDF/Markdown” from the chat header.
- **Team / shared agents**: single-user `AgentTask` rows today; no org-level dashboards.

Run **`pnpm db:migrate`** after pulling so `AgentTask` and optional `workflowRunId` (QStash) stay in sync with `lib/db/schema.ts`.
