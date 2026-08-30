CREATE TABLE IF NOT EXISTS "afk_users" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text,
	"afk_since" bigint NOT NULL,
	CONSTRAINT "afk_users_guild_user_pk" PRIMARY KEY("guild_id","user_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_afk_users_guild" ON "afk_users" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "server_stats_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"stat_type" text NOT NULL,
	"format" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "server_stats_guild_channel_unique" UNIQUE("guild_id","channel_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_server_stats_guild" ON "server_stats_channels" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "tags_guild_name_unique" UNIQUE("guild_id","name")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tags_guild" ON "tags" USING btree ("guild_id");
