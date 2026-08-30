CREATE TABLE IF NOT EXISTS "autoban_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_tag" text,
	"reason" text NOT NULL,
	"action" text NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_autoban_logs_guild" ON "autoban_logs" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_autoban_logs_created" ON "autoban_logs" USING btree ("created_at");
