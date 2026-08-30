CREATE TABLE "user_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"event_type" text NOT NULL,
	"event_data" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "form_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"form_name" text NOT NULL,
	"responses" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "discord_events_archive" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"guild_id" text,
	"target_id" text,
	"user_id" text,
	"username" text,
	"summary" text,
	"data_json" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "server_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"discriminator" text,
	"tag" text,
	"display_name" text,
	"avatar_url" text,
	"display_color" text,
	"highest_role_id" text,
	"highest_role_name" text,
	"highest_role_color" text,
	"joined_at" text,
	"account_created_at" text,
	"is_bot" integer DEFAULT 0,
	"rejoin_count" integer DEFAULT 0,
	"left_at" text,
	"roles" text,
	"presence" text DEFAULT 'offline',
	"deleted_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "server_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "member_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"action" text NOT NULL,
	"guild_id" text NOT NULL,
	"metadata" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "discord_channels" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" text,
	"position" integer DEFAULT 0,
	"topic" text,
	"is_nsfw" integer DEFAULT 0,
	"created_at" text,
	"deleted_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "discord_threads" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"parent_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_id" text,
	"archived" integer DEFAULT 0,
	"locked" integer DEFAULT 0,
	"message_count" integer DEFAULT 0,
	"member_count" integer DEFAULT 0,
	"created_at" text,
	"deleted_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "discord_users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"global_name" text,
	"discriminator" text,
	"bot" integer DEFAULT 0,
	"avatar_url" text,
	"banner_url" text,
	"created_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "discord_messages" (
	"message_id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"thread_id" text,
	"guild_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_username" text NOT NULL,
	"content" text,
	"pinned" integer DEFAULT 0,
	"embeds_json" text,
	"attachments_json" text,
	"reactions_json" text,
	"created_at" text NOT NULL,
	"deleted_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "discord_roles" (
	"role_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"color" integer DEFAULT 0,
	"color_hex" text,
	"icon_url" text,
	"unicode_emoji" text,
	"member_count" integer DEFAULT 0,
	"hoist" integer DEFAULT 0,
	"position" integer DEFAULT 0,
	"permissions" text,
	"managed" integer DEFAULT 0,
	"mentionable" integer DEFAULT 0,
	"created_at" text,
	"deleted_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "discord_emojis" (
	"emoji_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"animated" integer DEFAULT 0,
	"url" text,
	"roles_json" text,
	"created_at" text,
	"deleted_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "guild_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "guild_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "grognement" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "grognement_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "guild_stats" (
	"guild_id" text NOT NULL,
	"stat_key" text NOT NULL,
	"stat_value" text NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "guild_stats_guild_id_stat_key_pk" PRIMARY KEY("guild_id","stat_key")
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"locale" text DEFAULT 'fr',
	"timezone" text DEFAULT 'Europe/Paris',
	"owner_id" text,
	"premium_tier" integer DEFAULT 0,
	"joined_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"guild_id" text NOT NULL,
	"feature_name" text NOT NULL,
	"enabled" integer DEFAULT 0 NOT NULL,
	"config_json" text DEFAULT '{}' NOT NULL,
	"allowed_roles" text DEFAULT '[]' NOT NULL,
	"updated_by" text,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "feature_flags_guild_id_feature_name_pk" PRIMARY KEY("guild_id","feature_name")
);
--> statement-breakpoint
CREATE TABLE "bot_version_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "openaimessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"msgid" text NOT NULL,
	"prompt" text,
	"instruction" text,
	"model" text,
	"tokeninput" integer,
	"tokenoutput" integer,
	"content" text,
	"previousmsgid" text,
	"rawdata" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "openaimessages_msgid_unique" UNIQUE("msgid")
);
--> statement-breakpoint
CREATE TABLE "user_xp" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"xp" integer DEFAULT 0,
	"level" integer DEFAULT 1,
	"total_xp_earned" integer DEFAULT 0,
	"messages_count" integer DEFAULT 0,
	"voice_minutes" integer DEFAULT 0,
	"events_participated" integer DEFAULT 0,
	"last_message_xp" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "user_xp_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "xp_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"xp_amount" integer NOT NULL,
	"xp_type" text NOT NULL,
	"description" text,
	"metadata" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "voice_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"join_time" text DEFAULT CURRENT_TIMESTAMP,
	"leave_time" text,
	"duration_minutes" integer DEFAULT 0,
	"xp_earned" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"event_description" text,
	"event_date" text,
	"xp_reward" integer DEFAULT 0,
	"created_by" text,
	"is_active" integer DEFAULT 1,
	"created_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"xp_earned" integer DEFAULT 0,
	"joined_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "user_birthdays" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"birthdate" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "user_birthdays_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "birthday_guild_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'public' NOT NULL,
	"announce_channel_id" text,
	"announce_hour" integer DEFAULT 9 NOT NULL,
	"announce_timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"ping_role_id" text,
	"message_template" text DEFAULT '🎂 Joyeux anniversaire {user} !' NOT NULL,
	"temp_role_id" text,
	"enabled" integer DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "birthday_visibility" (
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "birthday_visibility_user_id_guild_id_pk" PRIMARY KEY("user_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "birthday_change_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" text,
	"change_number" integer NOT NULL,
	"previous_birthdate" text,
	"new_birthdate" text NOT NULL,
	"cooldown_until" bigint NOT NULL,
	"changed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "birthday_history" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"age" integer,
	"message_id" text,
	"gifts_given" text,
	"announced_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_warnings" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mod_id" text NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"rule" text,
	"created_at" bigint NOT NULL,
	"expires_at" bigint,
	"active" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sanctions" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"reason" text NOT NULL,
	"mod_id" text NOT NULL,
	"duration_ms" bigint,
	"starts_at" bigint NOT NULL,
	"expires_at" bigint,
	"revoked_by" text,
	"revoked_at" bigint,
	"revoked_reason" text,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mod_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mod_id" text,
	"action" text NOT NULL,
	"channel_id" text,
	"message_id" text,
	"reason" text,
	"metadata" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" text,
	"target_id" text,
	"channel_id" text,
	"metadata" text,
	"summary" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" text DEFAULT 'support' NOT NULL,
	"subject" text,
	"status" text DEFAULT 'open' NOT NULL,
	"claimed_by" text,
	"closed_by" text,
	"closed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text,
	"attachments" text,
	"is_staff" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welcome_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"welcome_channel_id" text,
	"welcome_message" text,
	"auto_roles" text,
	"is_enabled" integer DEFAULT 1,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "welcome_config_guild_id_unique" UNIQUE("guild_id")
);
--> statement-breakpoint
CREATE TABLE "welcome_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"template" text NOT NULL,
	"payload" text NOT NULL,
	"svg" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint
);
--> statement-breakpoint
CREATE TABLE "user_economy" (
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"bank_balance" bigint DEFAULT 0 NOT NULL,
	"last_daily_claim_at" bigint,
	"last_work_claim_at" bigint,
	"total_earned" bigint DEFAULT 0 NOT NULL,
	"total_spent" bigint DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "user_economy_user_id_guild_id_pk" PRIMARY KEY("user_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "economy_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"type" text NOT NULL,
	"counterparty_id" text,
	"reason" text,
	"metadata" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"emoji" text,
	"price" bigint NOT NULL,
	"role_reward_id" text,
	"xp_reward" bigint,
	"is_tradeable" integer DEFAULT 1 NOT NULL,
	"is_droppable" integer DEFAULT 1 NOT NULL,
	"max_per_user" integer,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_inventory" (
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"acquired_at" bigint NOT NULL,
	CONSTRAINT "user_inventory_user_id_guild_id_item_id_pk" PRIMARY KEY("user_id","guild_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_drops" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"item_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"started_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"claimed_by" text,
	"claimed_at" bigint,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"type" text NOT NULL,
	"price" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reported_id" text NOT NULL,
	"channel_id" text,
	"message_id" text,
	"reason" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"action" text NOT NULL,
	"notes" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reaction_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"emoji" text DEFAULT '' NOT NULL,
	"role_id" text DEFAULT '' NOT NULL,
	"description" text,
	"mode" text DEFAULT 'toggle' NOT NULL,
	"kind" text DEFAULT 'reaction' NOT NULL,
	"metadata" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temp_voice_config" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"category_id" text,
	"format" text DEFAULT '{user}''s game' NOT NULL,
	"delete_delay_seconds" integer DEFAULT 5 NOT NULL,
	"max_per_guild" integer DEFAULT 0 NOT NULL,
	"locked_role_id" text,
	"join_channels_json" text,
	"enabled" integer DEFAULT 0 NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temp_voice_state" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"creator_id" text,
	"last_empty_at" bigint DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sticky_roles" (
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"role_id" text NOT NULL,
	"saved_at" bigint NOT NULL,
	CONSTRAINT "sticky_roles_user_id_guild_id_role_id_pk" PRIMARY KEY("user_id","guild_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "giveaways" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"host_id" text NOT NULL,
	"prize" text NOT NULL,
	"description" text,
	"winners_count" integer DEFAULT 1 NOT NULL,
	"required_role_id" text,
	"starts_at" bigint NOT NULL,
	"ends_at" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"winners_json" text,
	"color" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "giveaway_entries" (
	"giveaway_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entered_at" bigint NOT NULL,
	CONSTRAINT "giveaway_entries_giveaway_id_user_id_pk" PRIMARY KEY("giveaway_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"question" text NOT NULL,
	"options_json" text NOT NULL,
	"multi_choice" integer DEFAULT 0 NOT NULL,
	"anonymous" integer DEFAULT 0 NOT NULL,
	"ends_at" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"poll_id" text NOT NULL,
	"user_id" text NOT NULL,
	"option_index" integer NOT NULL,
	"voted_at" bigint NOT NULL,
	CONSTRAINT "poll_votes_poll_id_user_id_option_index_pk" PRIMARY KEY("poll_id","user_id","option_index")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text,
	"channel_id" text,
	"user_id" text NOT NULL,
	"reminder_text" text NOT NULL,
	"fire_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_message_id" text
);
--> statement-breakpoint
CREATE TABLE "word_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"trigger_text" text NOT NULL,
	"match_type" text DEFAULT 'exact' NOT NULL,
	"response_text" text,
	"response_embed_json" text,
	"exclude_channel_ids_json" text,
	"exclude_role_ids_json" text,
	"required_role_ids_json" text,
	"cooldown_seconds" integer DEFAULT 10 NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"response_text" text,
	"response_embed_json" text,
	"restrict_channel_ids_json" text,
	"restrict_role_ids_json" text,
	"cooldown_seconds" integer DEFAULT 5 NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "idx_pg_custom_commands_unique" UNIQUE("guild_id","name")
);
--> statement-breakpoint
CREATE TABLE "user_captchas" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"guild_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"channel_id" text NOT NULL,
	"attempts" integer DEFAULT 0,
	"is_verified" integer DEFAULT 0,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	"expires_at" text,
	"verified_at" text,
	"expired_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "captcha_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text,
	"verified_role_id" text,
	"timeout_minutes" integer DEFAULT 10,
	"max_attempts" integer DEFAULT 3,
	"is_enabled" integer DEFAULT 1,
	"created_at" text DEFAULT CURRENT_TIMESTAMP,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "captcha_config_guild_id_unique" UNIQUE("guild_id")
);
--> statement-breakpoint
CREATE TABLE "bump_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"user_id" text,
	"username" text,
	"bumped_at" text DEFAULT CURRENT_TIMESTAMP,
	"reminder_sent" integer DEFAULT 0,
	"reminder_sent_at" text
);
--> statement-breakpoint
CREATE TABLE "countdown_state" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"current_number" integer DEFAULT 900,
	"error_count" integer DEFAULT 0,
	"is_trap_active" integer DEFAULT 0,
	"trap_number" integer,
	"last_user_id" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "countdown_scores" (
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"score" integer DEFAULT 0,
	CONSTRAINT "countdown_scores_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "counter_state" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"current_number" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"last_user_id" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"avatar_url" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"revoked_at" bigint
);
--> statement-breakpoint
CREATE TABLE "auth_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"user_id" text,
	"username" text,
	"ip_address" text NOT NULL,
	"user_agent" text,
	"reason" text,
	"metadata" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_failed_attempts" (
	"identifier" text PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"first_attempt_at" bigint NOT NULL,
	"last_attempt_at" bigint NOT NULL,
	"blocked_until" bigint
);
--> statement-breakpoint
CREATE INDEX "idx_pg_events_name" ON "discord_events_archive" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "idx_pg_events_created" ON "discord_events_archive" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_feature_flags_enabled" ON "feature_flags" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pg_event_user" ON "event_participants" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_birthday_visibility_user" ON "birthday_visibility" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_birthday_change_user" ON "birthday_change_log" USING btree ("user_id","guild_id");--> statement-breakpoint
CREATE INDEX "idx_pg_birthday_change_until" ON "birthday_change_log" USING btree ("cooldown_until");--> statement-breakpoint
CREATE INDEX "idx_pg_birthday_history_user" ON "birthday_history" USING btree ("user_id","guild_id","announced_at");--> statement-breakpoint
CREATE INDEX "idx_pg_birthday_history_guild" ON "birthday_history" USING btree ("guild_id","announced_at");--> statement-breakpoint
CREATE INDEX "idx_pg_user_warnings_guild_user" ON "user_warnings" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_user_warnings_active" ON "user_warnings" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_pg_user_sanctions_guild_user" ON "user_sanctions" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_user_sanctions_active" ON "user_sanctions" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_pg_mod_logs_guild_created" ON "mod_logs" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_mod_logs_guild_user" ON "mod_logs" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_event_log_guild_type" ON "event_log" USING btree ("guild_id","event_type");--> statement-breakpoint
CREATE INDEX "idx_pg_event_log_guild_created" ON "event_log" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_event_log_actor" ON "event_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_pg_event_log_target" ON "event_log" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_pg_tickets_guild_status" ON "tickets" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "idx_pg_tickets_user" ON "tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_tickets_channel" ON "tickets" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_pg_ticket_messages_ticket" ON "ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_pg_welcome_cards_user" ON "welcome_cards" USING btree ("guild_id","user_id","template");--> statement-breakpoint
CREATE INDEX "idx_pg_user_economy_balance" ON "user_economy" USING btree ("guild_id","balance");--> statement-breakpoint
CREATE INDEX "idx_pg_economy_tx_user" ON "economy_transactions" USING btree ("guild_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_economy_tx_created" ON "economy_transactions" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_shop_items_guild" ON "shop_items" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_pg_user_inventory_item" ON "user_inventory" USING btree ("guild_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_pg_user_inventory_user" ON "user_inventory" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_inventory_drops_status" ON "inventory_drops" USING btree ("guild_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_pg_inventory_drops_message" ON "inventory_drops" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_pg_inventory_transfers_to" ON "inventory_transfers" USING btree ("guild_id","to_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_reports_guild_status" ON "reports" USING btree ("guild_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_reports_reporter" ON "reports" USING btree ("guild_id","reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_reports_reported" ON "reports" USING btree ("guild_id","reported_id","status");--> statement-breakpoint
CREATE INDEX "idx_pg_report_actions_report" ON "report_actions" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_reaction_roles_message" ON "reaction_roles" USING btree ("guild_id","message_id");--> statement-breakpoint
CREATE INDEX "idx_pg_reaction_roles_guild" ON "reaction_roles" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_pg_reaction_roles_kind" ON "reaction_roles" USING btree ("guild_id","kind","message_id");--> statement-breakpoint
CREATE INDEX "idx_pg_temp_voice_state_guild" ON "temp_voice_state" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_pg_sticky_roles_user" ON "sticky_roles" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_giveaways_guild_status" ON "giveaways" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "idx_pg_giveaways_ends_at" ON "giveaways" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "idx_pg_giveaways_channel" ON "giveaways" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_pg_giveaway_entries_user" ON "giveaway_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_polls_guild_status" ON "polls" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "idx_pg_polls_message" ON "polls" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_pg_poll_votes_poll" ON "poll_votes" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "idx_pg_reminders_status" ON "reminders" USING btree ("status","fire_at");--> statement-breakpoint
CREATE INDEX "idx_pg_reminders_user" ON "reminders" USING btree ("user_id","status","fire_at");--> statement-breakpoint
CREATE INDEX "idx_pg_word_triggers_guild" ON "word_triggers" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_pg_custom_commands_guild" ON "custom_commands" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pg_user_guild_captcha" ON "user_captchas" USING btree ("user_id","guild_id");--> statement-breakpoint
CREATE INDEX "idx_pg_auth_sessions_user" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_auth_sessions_expires" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_pg_auth_sessions_token_hash" ON "auth_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "idx_pg_auth_audit_logs_ip" ON "auth_audit_logs" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_auth_audit_logs_user" ON "auth_audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_auth_audit_logs_type" ON "auth_audit_logs" USING btree ("event_type","created_at");--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "idx_suggestions_guild_number" ON "suggestions" USING btree ("guild_id","suggestion_number");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text,
	"embed_json" text,
	"cron_expression" text,
	"interval_minutes" integer,
	"next_run_at" bigint NOT NULL,
	"last_run_at" bigint,
	"enabled" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_messages_guild" ON "scheduled_messages" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_messages_due" ON "scheduled_messages" USING btree ("enabled","next_run_at");--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "idx_tags_guild" ON "tags" USING btree ("guild_id");--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "idx_ranks_guild" ON "ranks" USING btree ("guild_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "autoban_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_tag" text,
	"reason" text NOT NULL,
	"action" text NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_autoban_logs_guild" ON "autoban_logs" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_autoban_logs_created" ON "autoban_logs" USING btree ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_embeds" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"title" text,
	"description" text,
	"color" text,
	"fields" jsonb,
	"footer" text,
	"thumbnail" text,
	"image" text,
	"author" jsonb,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_custom_embeds_guild" ON "custom_embeds" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_custom_embeds_message" ON "custom_embeds" USING btree ("guild_id","message_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_purges" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"interval_hours" integer NOT NULL,
	"keep_pinned" boolean DEFAULT true NOT NULL,
	"last_purge_at" bigint DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "scheduled_purges_guild_channel_unique" UNIQUE("guild_id","channel_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_purges_guild" ON "scheduled_purges" USING btree ("guild_id");--> statement-breakpoint
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
CREATE INDEX "idx_pg_auth_failed_blocked" ON "auth_failed_attempts" USING btree ("blocked_until");