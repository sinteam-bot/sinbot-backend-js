CREATE TABLE IF NOT EXISTS "ticket_panels" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"channel_id" text,
	"category_id" text,
	"role_ids" text DEFAULT '[]' NOT NULL,
	"form_questions" jsonb,
	"button_label" text DEFAULT 'Ouvrir un ticket' NOT NULL,
	"button_emoji" text DEFAULT '📩' NOT NULL,
	"button_style" text DEFAULT 'Primary' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ticket_panels_guild_name_unique" UNIQUE("guild_id","name")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_panels_guild" ON "ticket_panels" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"staff_id" text,
	"rating" integer NOT NULL,
	"feedback" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "ticket_ratings_ticket_unique" UNIQUE("ticket_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_ratings_guild" ON "ticket_ratings" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_ratings_staff" ON "ticket_ratings" USING btree ("staff_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "ticket_tags_guild_name_unique" UNIQUE("guild_id","name")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_tags_guild" ON "ticket_tags" USING btree ("guild_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "panel_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "rating_score" integer;
