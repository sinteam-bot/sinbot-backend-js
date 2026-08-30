ALTER TABLE "server_stats_channels" ADD COLUMN IF NOT EXISTS "target_id" text;--> statement-breakpoint
ALTER TABLE "server_stats_channels" ADD COLUMN IF NOT EXISTS "timezone" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "statroles" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"role_id" text NOT NULL,
	"type" text NOT NULL,
	"threshold" integer NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "statroles_guild_role_type_unique" UNIQUE("guild_id","role_id","type")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_statroles_guild" ON "statroles" USING btree ("guild_id");
