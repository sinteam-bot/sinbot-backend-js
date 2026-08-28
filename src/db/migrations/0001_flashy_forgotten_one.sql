CREATE TABLE "invite_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text,
	"inviter_id" text,
	"inviter_username" text,
	"max_uses" integer DEFAULT 0,
	"uses" integer DEFAULT 0,
	"expires_at" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_uses" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"invite_code" text NOT NULL,
	"inviter_id" text NOT NULL,
	"inviter_username" text,
	"invited_id" text NOT NULL,
	"invited_username" text NOT NULL,
	"joined_at" bigint NOT NULL,
	"left_at" bigint,
	"is_fake" integer DEFAULT 0 NOT NULL,
	"fake_reason" text,
	"is_bot" integer DEFAULT 0 NOT NULL,
	"is_vanity" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_bonuses" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text,
	"moderator_id" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_blacklist" (
	"guild_id" text NOT NULL,
	"target_id" text NOT NULL,
	"target_type" text NOT NULL,
	"reason" text,
	"moderator_id" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "invite_blacklist_guild_id_target_id_pk" PRIMARY KEY("guild_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "invite_restore" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"total_invites" integer DEFAULT 0 NOT NULL,
	"real_invites" integer DEFAULT 0 NOT NULL,
	"bonus_invites" integer DEFAULT 0 NOT NULL,
	"leaves" integer DEFAULT 0 NOT NULL,
	"snapshot_at" bigint NOT NULL,
	"restored_at" bigint
);
--> statement-breakpoint
CREATE INDEX "idx_invite_codes_guild" ON "invite_codes" USING btree ("guild_id","deleted");--> statement-breakpoint
CREATE INDEX "idx_invite_uses_guild_inviter" ON "invite_uses" USING btree ("guild_id","inviter_id","joined_at");--> statement-breakpoint
CREATE INDEX "idx_invite_uses_guild_invited" ON "invite_uses" USING btree ("guild_id","invited_id");--> statement-breakpoint
CREATE INDEX "idx_invite_uses_invite_code" ON "invite_uses" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "idx_invite_bonuses_guild_user" ON "invite_bonuses" USING btree ("guild_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_invite_blacklist_guild" ON "invite_blacklist" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_invite_restore_guild_user" ON "invite_restore" USING btree ("guild_id","user_id","snapshot_at");