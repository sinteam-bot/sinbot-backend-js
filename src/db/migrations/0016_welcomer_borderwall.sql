CREATE TABLE IF NOT EXISTS "welcome_card_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"background_url" text,
	"primary_color" text DEFAULT '#5865F2' NOT NULL,
	"text_color" text DEFAULT '#FFFFFF' NOT NULL,
	"custom_subtitle" text DEFAULT 'Membre #{count}',
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "welcome_card_configs_guild_unique" UNIQUE("guild_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_welcome_card_configs_guild" ON "welcome_card_configs" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "borderwall_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"enabled" integer DEFAULT 0 NOT NULL,
	"raid_threshold" integer DEFAULT 5 NOT NULL,
	"raid_window_seconds" integer DEFAULT 10 NOT NULL,
	"quarantine_role_id" text,
	"log_channel_id" text,
	"timeout_minutes" integer DEFAULT 10 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "borderwall_configs_guild_unique" UNIQUE("guild_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_borderwall_configs_guild" ON "borderwall_configs" USING btree ("guild_id");
