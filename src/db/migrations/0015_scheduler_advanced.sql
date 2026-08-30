ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "auto_clean" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "last_message_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "template_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "is_one_time" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduler_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "scheduler_templates_guild_name_unique" UNIQUE("guild_id","name")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduler_templates_guild" ON "scheduler_templates" USING btree ("guild_id");
