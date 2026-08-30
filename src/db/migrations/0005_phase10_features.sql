CREATE TABLE IF NOT EXISTS "timed_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_timed_roles_guild_user" ON "timed_roles" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_timed_roles_expires" ON "timed_roles" USING btree ("expires_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ranks" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"role_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "ranks_guild_name_unique" UNIQUE("guild_id","name")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ranks_guild" ON "ranks" USING btree ("guild_id");
