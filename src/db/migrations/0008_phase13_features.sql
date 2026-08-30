CREATE TABLE IF NOT EXISTS "economy_boosts" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"multiplier" numeric(5, 2) NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_economy_boosts_guild_user" ON "economy_boosts" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_economy_boosts_expires" ON "economy_boosts" USING btree ("expires_at");
