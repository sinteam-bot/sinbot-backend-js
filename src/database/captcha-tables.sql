-- ============================================
-- TABLES POUR LE SYSTÈME DE CAPTCHA
-- ============================================

-- Table pour stocker les captchas des utilisateurs
CREATE TABLE IF NOT EXISTS user_captchas (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    guild_id VARCHAR(255) NOT NULL,
    question TEXT NOT NULL,
    answer VARCHAR(50) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    attempts INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'),
    verified_at TIMESTAMP NULL,
    expired_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, guild_id)
);

-- Index pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_user_captchas_user_guild ON user_captchas(user_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_user_captchas_expires ON user_captchas(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_captchas_verified ON user_captchas(is_verified);

-- Table pour stocker la configuration du captcha par serveur
CREATE TABLE IF NOT EXISTS captcha_config (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(255) UNIQUE NOT NULL,
    channel_id VARCHAR(255) NULL,
    verified_role_id VARCHAR(255) NULL,
    timeout_minutes INTEGER DEFAULT 10,
    max_attempts INTEGER DEFAULT 3,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour la configuration
CREATE INDEX IF NOT EXISTS idx_captcha_config_guild ON captcha_config(guild_id);

-- Commentaires sur les tables
COMMENT ON TABLE user_captchas IS 'Stocke les captchas en attente pour chaque utilisateur';
COMMENT ON TABLE captcha_config IS 'Stocke la configuration du captcha pour chaque serveur';

COMMENT ON COLUMN user_captchas.user_id IS 'ID Discord de l\'utilisateur';
COMMENT ON COLUMN user_captchas.guild_id IS 'ID Discord du serveur';
COMMENT ON COLUMN user_captchas.question IS 'Question mathématique posée à l\'utilisateur';
COMMENT ON COLUMN user_captchas.answer IS 'Réponse correcte (en chiffres)';
COMMENT ON COLUMN user_captchas.channel_id IS 'ID Discord du canal où le captcha a été envoyé';
COMMENT ON COLUMN user_captchas.attempts IS 'Nombre de tentatives de l\'utilisateur';
COMMENT ON COLUMN user_captchas.is_verified IS 'Indique si l\'utilisateur a réussi le captcha';
COMMENT ON COLUMN user_captchas.expires_at IS 'Date et heure d\'expiration du captcha';

COMMENT ON COLUMN captcha_config.channel_id IS 'ID Discord du canal de vérification';
COMMENT ON COLUMN captcha_config.verified_role_id IS 'ID Discord du rôle à donner après vérification';
COMMENT ON COLUMN captcha_config.timeout_minutes IS 'Temps avant expiration (en minutes)';
COMMENT ON COLUMN captcha_config.max_attempts IS 'Nombre maximum de tentatives autorisées';
COMMENT ON COLUMN captcha_config.is_enabled IS 'Indique si le captcha est activé pour ce serveur';
