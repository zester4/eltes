import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  or,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  message,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  vote,
  event,
  botIntegration,
  type BotIntegration,
  agentTask,
  type AgentTask,
  messageDeprecated,
  voteDeprecated,
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

/** True when Postgres reports the AgentTask relation is missing (migrations not applied). */
function isPostgresUndefinedAgentTaskError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: string; message?: string };
  if (record.code === "42P01") {
    return true;
  }
  const msg = record.message ?? "";
  return (
    msg.includes("does not exist") &&
    (msg.includes("AgentTask") || msg.includes('"AgentTask"'))
  );
}

/**
 * Columns from AgentTask migration 0012. Excludes `workflowRunId` (0013) so SELECT
 * works before that migration is applied — avoids 500 on /api/agent/tasks.
 */
const agentTaskListColumns = {
  id: agentTask.id,
  userId: agentTask.userId,
  chatId: agentTask.chatId,
  agentType: agentTask.agentType,
  task: agentTask.task,
  status: agentTask.status,
  result: agentTask.result,
  createdAt: agentTask.createdAt,
  updatedAt: agentTask.updatedAt,
} as const;

const activeAgentStatusFilter = or(
  eq(agentTask.status, "pending"),
  eq(agentTask.status, "running"),
);

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
  platformThreadId,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
  platformThreadId?: string;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
      platformThreadId,
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    return await db.transaction(async (tx) => {
      await tx.delete(vote).where(eq(vote.chatId, id));
      await tx.delete(message).where(eq(message.chatId, id));
      await tx.delete(voteDeprecated).where(eq(voteDeprecated.chatId, id));
      await tx.delete(messageDeprecated).where(eq(messageDeprecated.chatId, id));
      await tx.delete(stream).where(eq(stream.chatId, id));
      await tx.delete(agentTask).where(eq(agentTask.chatId, id));

      const [chatsDeleted] = await tx
        .delete(chat)
        .where(eq(chat.id, id))
        .returning();
      return chatsDeleted;
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    return await db.transaction(async (tx) => {
      const userChats = await tx
        .select({ id: chat.id })
        .from(chat)
        .where(eq(chat.userId, userId));

      if (userChats.length === 0) {
        return { deletedCount: 0 };
      }

      const chatIds = userChats.map((c) => c.id);

      await tx.delete(vote).where(inArray(vote.chatId, chatIds));
      await tx.delete(message).where(inArray(message.chatId, chatIds));
      await tx.delete(voteDeprecated).where(inArray(voteDeprecated.chatId, chatIds));
      await tx.delete(messageDeprecated).where(inArray(messageDeprecated.chatId, chatIds));
      await tx.delete(stream).where(inArray(stream.chatId, chatIds));
      await tx.delete(agentTask).where(inArray(agentTask.chatId, chatIds));

      const deletedChats = await tx
        .delete(chat)
        .where(eq(chat.userId, userId))
        .returning();

      return { deletedCount: deletedChats.length };
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.insert(message).values(messages);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await db.update(message).set({ parts }).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

/** Newest-first slice (e.g. handoff dedupe) without loading full thread. */
export async function getRecentMessagesForChat({
  chatId,
  limit,
}: {
  chatId: string;
  limit: number;
}) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, chatId))
      .orderBy(desc(message.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get recent messages for chat"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db.update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update title for chat", chatId, error);
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const timeAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, timeAgo),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

export async function saveEvent({
  userId,
  triggerSlug,
  payload,
}: {
  userId: string;
  triggerSlug: string;
  payload: any;
}) {
  try {
    return await db
      .insert(event)
      .values({
        userId,
        triggerSlug,
        payload,
        createdAt: new Date(),
        status: "received",
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save event");
  }
}

export async function getEventsByUserId({
  userId,
  limit = 20,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(event)
      .where(eq(event.userId, userId))
      .orderBy(desc(event.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get events by user id"
    );
  }
}

export async function updateEventStatus({
  id,
  status,
}: {
  id: string;
  status: "received" | "processed" | "failed";
}) {
  try {
    return await db.update(event).set({ status }).where(eq(event.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update event status");
  }
}

export async function saveBotIntegration({
  userId,
  platform,
  botToken,
  signingSecret,
  extraConfig,
}: {
  userId: string;
  platform: string;
  botToken: string;
  signingSecret?: string | null;
  extraConfig?: any | null;
}) {
  try {
    const [existing] = await db
      .select()
      .from(botIntegration)
      .where(and(eq(botIntegration.userId, userId), eq(botIntegration.platform, platform)));

    if (existing) {
      const updates: Record<string, unknown> = { botToken };
      if (signingSecret !== undefined) updates.signingSecret = signingSecret;
      if (extraConfig !== undefined) updates.extraConfig = extraConfig;
      return await db
        .update(botIntegration)
        .set(updates as any)
        .where(eq(botIntegration.id, existing.id))
        .returning();
    }

    return await db
      .insert(botIntegration)
      .values({
        userId,
        platform,
        botToken,
        signingSecret,
        extraConfig,
      })
      .returning();
  } catch (error) {
    throw new ChatbotError("bad_request:database", "Failed to save bot integration");
  }
}

export async function getBotIntegration({
  userId,
  platform,
}: {
  userId: string;
  platform: string;
}) {
  try {
    const [integration] = await db
      .select()
      .from(botIntegration)
      .where(and(eq(botIntegration.userId, userId), eq(botIntegration.platform, platform)));
    return integration;
  } catch (error) {
    throw new ChatbotError("bad_request:database", "Failed to get bot integration");
  }
}

export async function getUserBotIntegrations({ userId }: { userId: string }) {
  try {
    return await db
      .select()
      .from(botIntegration)
      .where(eq(botIntegration.userId, userId));
  } catch (error) {
    throw new ChatbotError("bad_request:database", "Failed to get user bot integrations");
  }
}

export async function createAgentTask({
  id,
  userId,
  chatId,
  agentType,
  task,
}: {
  id: string;
  userId: string;
  chatId: string;
  agentType: string;
  task: string;
}) {
  try {
    const [created] = await db
      .insert(agentTask)
      .values({ id, userId, chatId, agentType, task, status: "pending" })
      .returning(agentTaskListColumns);
    return created;
  } catch (error) {
    if (isPostgresUndefinedAgentTaskError(error)) {
      throw new ChatbotError(
        "bad_request:database",
        "AgentTask table is missing. Run pnpm db:migrate against this database.",
      );
    }
    throw new ChatbotError("bad_request:database", "Failed to create agent task");
  }
}

export async function getAgentTaskById({ id, userId }: { id: string; userId: string }) {
  try {
    const [task] = await db
      .select(agentTaskListColumns)
      .from(agentTask)
      .where(and(eq(agentTask.id, id), eq(agentTask.userId, userId)));
    return task;
  } catch (error) {
    if (isPostgresUndefinedAgentTaskError(error)) {
      return undefined;
    }
    throw new ChatbotError("bad_request:database", "Failed to get agent task");
  }
}

export async function getAgentTaskByIdOnly(id: string) {
  try {
    const [task] = await db
      .select(agentTaskListColumns)
      .from(agentTask)
      .where(eq(agentTask.id, id));
    return task;
  } catch (error) {
    if (isPostgresUndefinedAgentTaskError(error)) {
      return undefined;
    }
    throw new ChatbotError("bad_request:database", "Failed to get agent task");
  }
}

/** Returns workflowRunId only if column exists (migration 0013 applied). */
export async function getAgentTaskWorkflowRunId({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<string | null> {
  try {
    const [row] = await db
      .select({ workflowRunId: agentTask.workflowRunId })
      .from(agentTask)
      .where(and(eq(agentTask.id, id), eq(agentTask.userId, userId)));
    return row?.workflowRunId ?? null;
  } catch {
    return null;
  }
}

export async function updateAgentTask({
  id,
  userId,
  status,
  result,
  workflowRunId,
}: {
  id: string;
  userId: string;
  status?: "running" | "completed" | "failed";
  result?: { text?: string; toolCalls?: unknown[]; error?: string };
  workflowRunId?: string | null;
}) {
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (result !== undefined) updates.result = result;
    if (workflowRunId !== undefined) updates.workflowRunId = workflowRunId;
    const [updated] = await db
      .update(agentTask)
      .set(updates as any)
      .where(and(eq(agentTask.id, id), eq(agentTask.userId, userId)))
      .returning(agentTaskListColumns);
    return updated;
  } catch (error) {
    if (isPostgresUndefinedAgentTaskError(error)) {
      throw new ChatbotError(
        "bad_request:database",
        "AgentTask table is missing. Run pnpm db:migrate against this database.",
      );
    }
    throw new ChatbotError("bad_request:database", "Failed to update agent task");
  }
}

export async function getActiveAgentTasksByUserId(userId: string) {
  try {
    return await db
      .select(agentTaskListColumns)
      .from(agentTask)
      .where(and(eq(agentTask.userId, userId), activeAgentStatusFilter))
      .orderBy(desc(agentTask.createdAt));
  } catch (error) {
    if (isPostgresUndefinedAgentTaskError(error)) {
      return [];
    }
    throw new ChatbotError("bad_request:database", "Failed to get agent tasks");
  }
}

export async function getActiveAgentTasksByChatId(chatId: string, userId: string) {
  try {
    return await db
      .select(agentTaskListColumns)
      .from(agentTask)
      .where(
        and(
          eq(agentTask.chatId, chatId),
          eq(agentTask.userId, userId),
          activeAgentStatusFilter,
        ),
      )
      .orderBy(desc(agentTask.createdAt));
  } catch (error) {
    if (isPostgresUndefinedAgentTaskError(error)) {
      return [];
    }
    throw new ChatbotError("bad_request:database", "Failed to get agent tasks");
  }
}

export async function getRecentAgentTasksByUserId(
  userId: string,
  limit = 100,
) {
  try {
    return await db
      .select(agentTaskListColumns)
      .from(agentTask)
      .where(eq(agentTask.userId, userId))
      .orderBy(desc(agentTask.createdAt))
      .limit(limit);
  } catch (error) {
    if (isPostgresUndefinedAgentTaskError(error)) {
      return [];
    }
    throw new ChatbotError("bad_request:database", "Failed to get agent tasks");
  }
}
