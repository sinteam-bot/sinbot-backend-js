CREATE TABLE IF NOT EXISTS "custom_embeds" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"title" text,
	"description" text,
	"color" text,
	"fields" jsonb,
	"footer" text,
	"thumbnail" text,
	"image" text,
	"author" jsonb,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_custom_embeds_guild" ON "custom_embeds" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_custom_embeds_message" ON "custom_embeds" USING btree ("guild_id","message_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_purges" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"interval_hours" integer NOT NULL,
	"keep_pinned" boolean DEFAULT true NOT NULL,
	"last_purge_at" bigint DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "scheduled_purges_guild_channel_unique" UNIQUE("guild_id","channel_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_purges_guild" ON "scheduled_purges" USING btree ("guild_id");
