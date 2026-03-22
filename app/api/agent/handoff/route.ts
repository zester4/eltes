import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import {
  getChatById,
  getRecentMessagesForChat,
  saveMessages,
} from "@/lib/db/queries";
import {
  buildSubAgentHandoffMarker,
  messagePartsContainHandoffForTask,
} from "@/lib/agent/sub-agent-handoff-markers";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";
import { generateUUID } from "@/lib/utils";

export const maxDuration = 120;

type HandoffBody = {
  chatId: string;
  userId: string;
  taskId: string;
  agentName: string;
  slug: string;
  task: string;
  outcome: "completed" | "failed";
  summary: string;
};

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-agent-secret");
  const expected = process.env.AGENT_DELEGATE_SECRET ?? "dev-internal";
  if (secret !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: HandoffBody;
  try {
    body = (await req.json()) as HandoffBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { chatId, userId, taskId, agentName, task, outcome, summary } = body;

  if (
    !chatId ||
    !userId ||
    !taskId ||
    !agentName ||
    !task ||
    (outcome !== "completed" && outcome !== "failed")
  ) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  const chat = await getChatById({ id: chatId });
  if (!chat || chat.userId !== userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const recent = await getRecentMessagesForChat({ chatId, limit: 40 });
  for (const m of recent) {
    if (messagePartsContainHandoffForTask(m.parts, taskId)) {
      return NextResponse.json({ ok: true, skipped: true });
    }
  }

  const excerpt =
    summary.length > 12_000 ? `${summary.slice(0, 12_000)}…` : summary;

  const system = `You are Etles, the user's primary AI assistant in this product.
A specialized sub-agent has finished work. Write ONE assistant message to the user:
- Open by acknowledging the sub-agent (${agentName}) has finished.
- Briefly summarize what mattered (2–5 short sentences). Use markdown if helpful.
- If it failed, be clear and constructive without blaming "the system" vaguely.
- End with a concrete offer to go deeper or take a next step.
Do not paste raw JSON. Do not repeat the full sub-agent output — summarize only.`;

  const userPrompt =
    outcome === "completed"
      ? `Original delegated task:\n${task}\n\nSub-agent outcome: success\n\nSub-agent output / notes:\n${excerpt || "(no text)"}`
      : `Original delegated task:\n${task}\n\nSub-agent outcome: failed\n\nError / details:\n${excerpt || "(none)"}`;

  const { text } = await generateText({
    model: getLanguageModel(process.env.SUBAGENT_HANDOFF_MODEL?.trim() || DEFAULT_CHAT_MODEL),
    system,
    prompt: userPrompt,
  });

  const visible = text.trim() || (
    outcome === "completed"
      ? `Your **${agentName}** sub-agent finished the task you delegated. Check the result card above for details.`
      : `Your **${agentName}** sub-agent run did not complete successfully. See the result card above for the error.`
  );

  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [
          { type: "text", text: visible },
          { type: "text", text: buildSubAgentHandoffMarker(taskId) },
        ],
        attachments: [],
        createdAt: new Date(),
      },
    ],
  });

  return NextResponse.json({ ok: true });
}
