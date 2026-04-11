CREATE TABLE IF NOT EXISTS "AgentOrchestration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"chatId" uuid NOT NULL,
	"goal" text NOT NULL,
	"strategy" varchar DEFAULT 'parallel' NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"agentSlugs" json NOT NULL,
	"plan" json,
	"result" json,
	"workflowRunId" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SupermodeAction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessionId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"stepIndex" integer NOT NULL,
	"actionType" varchar NOT NULL,
	"toolName" varchar(128),
	"toolInput" json,
	"toolOutput" json,
	"reasoning" text,
	"summary" text,
	"requiresApproval" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SupermodeSession" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"chatId" uuid NOT NULL,
	"objective" text NOT NULL,
	"status" varchar DEFAULT 'planning' NOT NULL,
	"workflowRunId" varchar(128),
	"currentStep" integer DEFAULT 0 NOT NULL,
	"maxSteps" integer DEFAULT 25 NOT NULL,
	"plan" json,
	"result" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentOrchestration" ADD CONSTRAINT "AgentOrchestration_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentOrchestration" ADD CONSTRAINT "AgentOrchestration_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SupermodeAction" ADD CONSTRAINT "SupermodeAction_sessionId_SupermodeSession_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."SupermodeSession"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SupermodeAction" ADD CONSTRAINT "SupermodeAction_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SupermodeSession" ADD CONSTRAINT "SupermodeSession_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SupermodeSession" ADD CONSTRAINT "SupermodeSession_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
