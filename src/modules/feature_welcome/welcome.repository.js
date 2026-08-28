/**
 * feature_welcome/welcome.repository.js
 *
 * Repository du module Welcome. Gère la config d'accueil par guilde
 * et les cartes de bienvenue (SVG cachées).
 *
 * Le code est porté nativement depuis `src/db/legacy-bridge-impl.js`
 * (cf. critère 7 du plan db-repository-split.md) — utilise Drizzle
 * directement sur le schema local.
 */

const { eq, sql } = require('drizzle-orm');
const { Repository } = require('../../core/index.js');
const { db, schema } = require('../../db/index.js');
const { welcomeConfig } = require('./db/schema.js');

class WelcomeRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    async getWelcomeConfig(guildId) {
        try {
            const [cfg] = await this.db.select()
                .from(welcomeConfig)
                .where(eq(welcomeConfig.guildId, guildId))
                .limit(1);

            if (!cfg) return null;

            let parsedRoles = [];
            if (cfg.autoRoles) {
                try {
                    parsedRoles = JSON.parse(cfg.autoRoles);
                } catch {
                    parsedRoles = cfg.autoRoles.split(',');
                }
            }

            return {
                ...cfg,
                guild_id: cfg.guildId,
                welcome_channel_id: cfg.welcomeChannelId,
                welcome_message: cfg.welcomeMessage,
                auto_roles: parsedRoles,
                is_enabled: cfg.isEnabled
            };
        } catch (error) {
            console.error('❌ Erreur getWelcomeConfig:', error);
            throw error;
        }
    }

    async saveWelcomeConfig(guildId, welcomeChannelId, welcomeMessage, autoRoles = [], isEnabled = 1) {
        try {
            const rolesPayload = Array.isArray(autoRoles) ? JSON.stringify(autoRoles) : autoRoles;

            const [saved] = await this.db.insert(welcomeConfig)
                .values({
                    guildId,
                    welcomeChannelId,
                    welcomeMessage,
                    autoRoles: rolesPayload,
                    isEnabled: isEnabled ? 1 : 0,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: welcomeConfig.guildId,
                    set: {
                        welcomeChannelId,
                        welcomeMessage,
                        autoRoles: rolesPayload,
                        isEnabled: isEnabled ? 1 : 0,
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                })
                .returning();

            return saved;
        } catch (error) {
            console.error('❌ Erreur saveWelcomeConfig:', error);
            throw error;
        }
    }
}

Repository()(WelcomeRepository);

module.exports = { WelcomeRepository };
