import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  platformProvider: varchar("platformProvider", { length: 64 }),
  platformUserId: varchar("platformUserId", { length: 255 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  platformThreadId: varchar("platformThreadId", { length: 255 }),
});

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chatbot.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chatbot.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

export const event = pgTable("Event", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  triggerSlug: varchar("triggerSlug").notNull(),
  payload: json("payload").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  status: varchar("status", {
    enum: ["received", "processed", "failed"],
  })
    .notNull()
    .default("received"),
});

export type Event = InferSelectModel<typeof event>;

export const botIntegration = pgTable("BotIntegration", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  platform: varchar("platform", { length: 64 }).notNull(),
  botToken: text("botToken").notNull(),
  signingSecret: text("signingSecret"),
  extraConfig: json("extraConfig"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type BotIntegration = InferSelectModel<typeof botIntegration>;

export const agentTask = pgTable("AgentTask", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  agentType: varchar("agentType", { length: 64 }).notNull(),
  task: text("task").notNull(),
  status: varchar("status", {
    enum: ["pending", "running", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  result: json("result"),
  workflowRunId: varchar("workflowRunId", { length: 128 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type AgentTask = InferSelectModel<typeof agentTask>;

// ── AgentOrchestration ────────────────────────────────────────────────────────
// Tracks multi-agent fan-out runs where an orchestrator coordinates N sub-agents
// working in parallel or sequential order toward a shared goal.
export const agentOrchestration = pgTable("AgentOrchestration", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  goal: text("goal").notNull(),
  strategy: varchar("strategy", { enum: ["parallel", "sequential"] })
    .notNull()
    .default("parallel"),
  status: varchar("status", {
    enum: ["pending", "planning", "running", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  agentSlugs: json("agentSlugs").$type<string[]>().notNull(),
  plan: json("plan"),
  result: json("result"),
  workflowRunId: varchar("workflowRunId", { length: 128 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type AgentOrchestration = InferSelectModel<typeof agentOrchestration>;

// ── SupermodeSession ──────────────────────────────────────────────────────────
// Tracks an autonomous SuperMode run. One session per user objective. The
// workflow runs for as long as needed; idle time costs nothing.
export const supermodeSession = pgTable("SupermodeSession", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  objective: text("objective").notNull(),
  status: varchar("status", {
    enum: [
      "planning",
      "running",
      "awaiting_approval",
      "completed",
      "failed",
      "cancelled",
    ],
  })
    .notNull()
    .default("planning"),
  workflowRunId: varchar("workflowRunId", { length: 128 }),
  currentStep: integer("currentStep").notNull().default(0),
  maxSteps: integer("maxSteps").notNull().default(25),
  plan: json("plan"),
  result: json("result"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  completedAt: timestamp("completedAt"),
});

export type SupermodeSession = InferSelectModel<typeof supermodeSession>;

// ── SupermodeAction ───────────────────────────────────────────────────────────
// Every action taken during a SuperMode session — the live activity feed.
// Written after every tool call, approval gate, and completion event.
export const supermodeAction = pgTable("SupermodeAction", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  sessionId: uuid("sessionId")
    .notNull()
    .references(() => supermodeSession.id),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  stepIndex: integer("stepIndex").notNull(),
  actionType: varchar("actionType", {
    enum: [
      "planning",
      "tool_call",
      "reasoning",
      "approval_requested",
      "approved",
      "rejected",
      "completed",
      "failed",
    ],
  }).notNull(),
  toolName: varchar("toolName", { length: 128 }),
  toolInput: json("toolInput"),
  toolOutput: json("toolOutput"),
  reasoning: text("reasoning"),
  summary: text("summary"),
  requiresApproval: boolean("requiresApproval").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type SupermodeAction = InferSelectModel<typeof supermodeAction>;