ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "platformThreadId" varchar(255);--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "platformProvider" varchar(64);--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "platformUserId" varchar(255);