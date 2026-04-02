//app/(chat)/api/scheduled/route.ts
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { getGoogleModel, getLanguageModel } from "@/lib/ai/providers";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  getChatsByUserId,
  saveMessages,
  updateAgentTask,
} from "@/lib/db/queries";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  saveMemory,
  recallMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/ai/tools/memory";
import { generateUUID } from "@/lib/utils";

const composioStatus = new Composio({ provider: new VercelProvider() });

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, message } = body;

    console.log(`[QStash] Proactive trigger: "${message}" for user ${userId}`);

    // 1. Get the most recent chat for this user to append the reminder to
    const { chats } = await getChatsByUserId({
      id: userId,
      limit: 1,
      startingAfter: null,
      endingBefore: null,
    });

    const activeChat = chats[0];
    if (!activeChat) {
      console.warn(`[QStash] No active chat found for user ${userId}. Skipping reminder.`);
      return NextResponse.json({ ok: false, error: "No active chat found" });
    }

    const chatId = activeChat.id;

    // 2. Initialize tools for the proactive agent
    // We only include non-UI tools (no artifacts/documents)
    let composioTools: Record<string, any> = {};
    try {
      const composioSession = await composioStatus.create(userId);
      composioTools = await composioSession.tools();
    } catch (e) {
      console.error("[QStash] Failed to load Composio tools:", e);
    }

    const tools = {
      ...composioTools,
      getWeather,
      saveMemory: saveMemory({ userId }),
      recallMemory: recallMemory({ userId }),
      updateMemory: updateMemory({ userId }),
      deleteMemory: deleteMemory({ userId }),
    };

    // 3. Run the proactive agent
    const systemInstruction = `You are Etles, the user's proactive AI assistant. 
A scheduled reminder or recurring task has just fired: "${message}".
Your goal is to fulfill this reminder immediately by taking any necessary actions (using your tools) and then leaving a brief message for the user in their chat.
If the reminder is just a notification, tell the user. 
If the reminder implies action (e.g. "Send email"), execute the action.
Today's date is ${new Date().toLocaleDateString()}.
Be direct and helpful.`;

    const result = await generateText({
      model: getGoogleModel("gemini-2.5-flash"),
      system: systemInstruction,
      prompt: `Reminder triggered: ${message}`,
      tools,
      stopWhen: stepCountIs(25),
    });

    // 4. Save the interaction back to the database
    const messagesToSave: any[] = [];
    const timestamp = new Date();

    // Save the reminder trigger
    messagesToSave.push({
      id: generateUUID(),
      chatId,
      role: "user",
      parts: [{ type: "text", text: `[Scheduled]: ${message}` }],
      attachments: [],
      createdAt: timestamp,
    });

    // Save assistant text response
    if (result.text) {
      messagesToSave.push({
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [{ type: "text", text: result.text }],
        attachments: [],
        createdAt: new Date(timestamp.getTime() + 1000), // Ensure later timestamp
      });
    }

    // Save tool executions if any — tool-call and tool-result are merged into a
    // single assistant message per step. The AI SDK UIMessage schema has no
    // "tool" role; results live as parts inside assistant messages.
    if (result.steps) {
      let offset = 2_000;
      for (const step of result.steps) {
        if (!step.toolCalls?.length) continue;
        for (const call of step.toolCalls) {
          const toolCallId = (call as any).toolCallId;
          const toolResult = step.toolResults?.find((r: any) => r.toolCallId === toolCallId);

          const parts: any[] = [
            {
              type: "tool-call",
              toolCallId,
              toolName: (call as any).toolName,
              args: (call as any).args,
            },
          ];

          if (toolResult) {
            parts.push({
              type: "tool-result",
              toolCallId,
              toolName: (call as any).toolName,
              result: (toolResult as any).result,
            });
          }

          messagesToSave.push({
            id: generateUUID(),
            chatId,
            role: "assistant",
            parts,
            attachments: [],
            createdAt: new Date(timestamp.getTime() + offset),
          });

          offset += 1_000;
        }
      }
    }

    await saveMessages({ messages: messagesToSave });

    // 5. Update AgentTask status if it exists
    const qstashMessageId = req.headers.get("upstash-message-id");
    if (qstashMessageId) {
      try {
        await updateAgentTask({
          id: qstashMessageId,
          userId,
          status: "completed",
          result: { text: result.text, toolCalls: result.toolCalls },
        });
      } catch (err) {
        console.warn(`[QStash] Could not update AgentTask ${qstashMessageId}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Proactive trigger completed",
      actionTaken: result.text,
      toolCount: result.toolCalls?.length ?? 0
    });
  } catch (error: any) {
    console.error("[QStash] Proactive trigger failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}

export const POST = verifySignatureAppRouter(handler);
