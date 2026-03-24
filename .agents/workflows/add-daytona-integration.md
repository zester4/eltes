---
description: How to add Daytona Sandbox integration to the Etles Agent
---

# Adding Daytona Sandbox Integration to Etles

This workflow provides step-by-step instructions for a developer to implement Daytona as a secure execution sandbox for the Etles agent. This integration will give Etles the ability to run code, search the file system, and perform Git operations in an isolated environment.

## 1. Install Daytona SDK Dependencies
You need to install the Daytona TypeScript SDK in the `eltes` project.

```bash
npm install @daytona/sdk
```

## 2. Create Daytona Tools (`lib/ai/tools/daytona.ts`)
Create a new file `lib/ai/tools/daytona.ts` to expose Daytona capabilities as AI tools:

- **`createSandbox` tool**: Uses the Daytona SDK to spin up a new workspace.
- **`runCommand` tool**: Uses the Daytona SDK to execute shell commands (e.g., `npm install`, `python script.py`) inside the active sandbox.
- **`gitOperation` tool**: Abstracts Git commands (clone, checkout, commit, push) within the sandbox.
- **`fileSearch` tool**: Executes `grep` or `find` commands inside the sandbox to search the filesystem.

*Example Tool Structure (`lib/ai/tools/daytona.ts`):*
```typescript
import { tool } from "ai";
import { z } from "zod";
import { Daytona } from "@daytona/sdk"; // Conceptual import

const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY });

export const createSandbox = ({ userId }: { userId: string }) =>
  tool({
    description: "Create an isolated code execution sandbox for running scripts and searching files.",
    inputSchema: z.object({
      repositoryUrl: z.string().optional().describe("Optional Git repository to clone into the sandbox")
    }),
    execute: async ({ repositoryUrl }) => {
      // Implementation logic using Daytona SDK
      // Return workspace ID
    }
  });

export const runSandboxCommand = ({ userId }: { userId: string }) =>
  tool({
    description: "Run a shell command inside the active Daytona sandbox.",
    inputSchema: z.object({
      workspaceId: z.string(),
      command: z.string()
    }),
    execute: async ({ workspaceId, command }) => {
      // Execute command in workspace using Daytona SDK
      // Return stdout/stderr
    }
  });
```

## 3. Expose Tools in the Core Chat Route
Update the main chat handler defined at `app/(chat)/api/chat/route.ts` to inject the new Daytona tools into the LLM stream.

1. Import the new tools from `lib/ai/tools/daytona.ts`.
2. Add the tool names to the `experimental_activeTools` array in `streamText`.
3. Map the tool implementations in the `tools` object of `streamText`, passing necessary context like `userId`.

*Example in `route.ts`:*
```typescript
import { createSandbox, runSandboxCommand } from "@/lib/ai/tools/daytona";

// Inside streamText configuration:
tools: {
  // ... existing tools
  createSandbox: createSandbox({ userId: session.user.id }),
  runSandboxCommand: runSandboxCommand({ userId: session.user.id }),
}
```

## 4. Add Environment Variables
Make sure to add the necessary Daytona configuration variables to your `.env` template so developers know what to provide.

```env
DAYTONA_API_KEY=your_daytona_api_key_here
DAYTONA_SERVER_URL=https://your.daytona.server/api # If self-hosting
```

## 5. Security & Isolation Considerations
When implementing the tools:
- Ensure the `workspaceId` is tied to the `userId` in your database or state management to prevent cross-tenant access.
- Restrict commands that can be run if necessary, or rely on Daytona's native sandboxing to contain malicious AI-generated code.
- Implement a cleanup mechanism (e.g., a QStash cron job) to terminate idle Daytona workspaces after a certain period of inactivity to save compute costs.
