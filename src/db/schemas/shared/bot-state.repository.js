/**
 * db/schemas/shared/bot-state.repository.js
 *
 * Repository transverse pour l'état runtime du bot (KV store).
 * Utilise la table `bot_version_state` (définie dans `bot-info.js`).
 *
 * Consommé par : `feature_info`, `feature_daily-message`, `notifier_startup`.
 *
 * Le code est porté nativement depuis `src/db/legacy-bridge-impl.js`.
 */

const { eq, sql } = require('drizzle-orm');
const { Repository } = require('../../../core/index.js');
const { db, schema } = require('../../index.js');
const { botVersionState } = require('./bot-info.js');

class BotStateRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    async getBotState(key) {
        try {
            const [state] = await this.db.select()
                .from(botVersionState)
                .where(eq(botVersionState.key, key))
                .limit(1);
            return state ? state.value : null;
        } catch (error) {
            console.error(`❌ Erreur getBotState(${key}):`, error);
            return null;
        }
    }

    async setBotState(key, value) {
        try {
            await this.db.insert(botVersionState)
                .values({
                    key,
                    value: String(value),
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: botVersionState.key,
                    set: {
                        value: String(value),
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                });
            return true;
        } catch (error) {
            console.error(`❌ Erreur setBotState(${key}):`, error);
            return false;
        }
    }
}

Repository()(BotStateRepository);

module.exports = { BotStateRepository };
