CREATE TABLE IF NOT EXISTS "autothread_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"title_format" text DEFAULT '{author} - {message}' NOT NULL,
	"intro_message" text,
	"slowmode_seconds" integer DEFAULT 0 NOT NULL,
	"auto_pin" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "autothread_channels_guild_channel_unique" UNIQUE("guild_id","channel_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_autothread_channels_guild" ON "autothread_channels" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "autothreads" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"parent_channel_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"starter_message_id" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "autothreads_thread_id_unique" UNIQUE("thread_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_autothreads_guild" ON "autothreads" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_autothreads_thread_id" ON "autothreads" USING btree ("thread_id");
