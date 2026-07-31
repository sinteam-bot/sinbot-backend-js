const { Pool } = require('pg');
require('dotenv').config();

// Configuration de la connexion PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// SQL pour créer les tables
const createTablesSQL = `
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
`;

async function setupCaptchaTables() {
    const client = await pool.connect();
    
    try {
        console.log('🔧 Configuration des tables Captcha...');
        console.log('');
        
        // Exécuter le SQL
        await client.query('BEGIN');
        
        await client.query(createTablesSQL);
        
        await client.query('COMMIT');
        
        console.log('✅ Tables Captcha créées avec succès !');
        console.log('');
        console.log('Tables créées:');
        console.log('  - user_captchas: Stocke les captchas en attente');
        console.log('  - captcha_config: Stocke la configuration par serveur');
        console.log('');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur lors de la création des tables Captcha:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Exécuter
setupCaptchaTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
