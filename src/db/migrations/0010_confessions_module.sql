CREATE TABLE IF NOT EXISTS "confessions" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"number" integer NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"status" text DEFAULT 'published' NOT NULL,
	"channel_id" text,
	"message_id" text,
	"review_message_id" text,
	"parent_confession_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_confessions_guild" ON "confessions" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_confessions_guild_number" ON "confessions" USING btree ("guild_id","number");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "confession_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text,
	"banned_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "confession_bans_guild_user_unique" UNIQUE("guild_id","user_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_confession_bans_guild" ON "confession_bans" USING btree ("guild_id");
