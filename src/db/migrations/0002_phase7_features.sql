ALTER TABLE "user_economy" ADD COLUMN IF NOT EXISTS "last_work_claim_at" bigint;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "starboard_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"source_channel_id" text NOT NULL,
	"source_message_id" text NOT NULL,
	"starboard_message_id" text,
	"author_id" text NOT NULL,
	"reaction_count" integer DEFAULT 0 NOT NULL,
	"starred_users" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "starboard_entries_guild_source_unique" UNIQUE("guild_id","source_message_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_starboard_guild" ON "starboard_entries" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_starboard_source" ON "starboard_entries" USING btree ("guild_id","source_message_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"suggestion_number" integer NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"channel_id" text,
	"message_id" text,
	"staff_id" text,
	"staff_reason" text,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "suggestions_guild_number_unique" UNIQUE("guild_id","suggestion_number")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suggestions_guild_status" ON "suggestions" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suggestions_guild_number" ON "suggestions" USING btree ("guild_id","suggestion_number");
