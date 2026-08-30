CREATE TABLE IF NOT EXISTS "scheduled_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text,
	"embed_json" text,
	"cron_expression" text,
	"interval_minutes" integer,
	"next_run_at" bigint NOT NULL,
	"last_run_at" bigint,
	"enabled" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_messages_guild" ON "scheduled_messages" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_messages_due" ON "scheduled_messages" USING btree ("enabled","next_run_at");--> statement-breakpoint
ALTER TABLE "word_triggers" ADD COLUMN IF NOT EXISTS "required_role_ids_json" text;
