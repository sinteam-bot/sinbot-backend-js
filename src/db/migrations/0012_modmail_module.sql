CREATE TABLE IF NOT EXISTS "modmail_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" bigint NOT NULL,
	"closed_at" bigint,
	"closed_by" text,
	"close_reason" text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modmail_threads_guild" ON "modmail_threads" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modmail_threads_user" ON "modmail_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modmail_threads_channel" ON "modmail_threads" USING btree ("channel_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modmail_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"sender_type" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_name" text NOT NULL,
	"content" text NOT NULL,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modmail_messages_thread" ON "modmail_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modmail_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text,
	"banned_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "modmail_bans_guild_user_unique" UNIQUE("guild_id","user_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modmail_bans_guild" ON "modmail_bans" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modmail_snippets" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "modmail_snippets_guild_name_unique" UNIQUE("guild_id","name")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modmail_snippets_guild" ON "modmail_snippets" USING btree ("guild_id");
