CREATE TABLE IF NOT EXISTS "forms" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"channel_id" text NOT NULL,
	"questions_json" jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "forms_guild_name_unique" UNIQUE("guild_id","name")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_forms_guild" ON "forms" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "form_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"answers_json" jsonb NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_form_submissions_form" ON "form_submissions" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_form_submissions_user" ON "form_submissions" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_highlights" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"keyword" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "user_highlights_guild_user_keyword_unique" UNIQUE("guild_id","user_id","keyword")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_highlights_guild" ON "user_highlights" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_highlights_keyword" ON "user_highlights" USING btree ("guild_id","keyword");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "autofeeds" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"feed_url" text NOT NULL,
	"feed_type" text DEFAULT 'rss' NOT NULL,
	"last_item_id" text,
	"last_item_published_at" bigint DEFAULT 0 NOT NULL,
	"interval_minutes" integer DEFAULT 15 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_autofeeds_guild" ON "autofeeds" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_timers" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"ends_at" bigint NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_timers_ends_at" ON "user_timers" USING btree ("ends_at","notified");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sticky_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"content" text NOT NULL,
	"embed_json" jsonb,
	"last_message_id" text,
	"cooldown_messages" integer DEFAULT 1 NOT NULL,
	"message_count_since_post" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "sticky_messages_guild_channel_unique" UNIQUE("guild_id","channel_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sticky_messages_guild" ON "sticky_messages" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guild_languages" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"language" text DEFAULT 'fr' NOT NULL,
	"updated_at" bigint NOT NULL
);
