-- 0017_captcha_history.sql
-- Permet de conserver l'historique complet des tentatives de captcha par
-- (user_id, guild_id) au lieu d'écraser la ligne précédente via UPSERT.
-- Chaque arrivée / tentative crée désormais une nouvelle ligne.

DROP INDEX IF EXISTS "idx_pg_user_guild_captcha";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pg_user_captchas_user_guild_created"
    ON "user_captchas" USING btree ("user_id", "guild_id", "created_at" DESC);