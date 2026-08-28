/**
 * db/schemas/shared/game-state.repository.js
 *
 * Repository transverse pour l'état des jeux (counter / countdown).
 * Combine les tables `counter_state` (game_road-to-infinite) et
 * `countdown_state` / `countdown_scores` (game_count-down) pour exposer
 * une API unifiée utilisée par le webRouter et autres consommateurs
 * transverses.
 *
 * Les repositories natifs par jeu restent la source de vérité pour
 * les modules dédiés (cf. `game_count-down/count-down.repository.js`).
 */

const { eq, desc, sql } = require('drizzle-orm');
const { Repository } = require('../../../core/index.js');
const { db, schema } = require('../../index.js');
const { counterState } = require('../../../modules/game_road-to-infinite/db/schema.js');
const { countdownState, countdownScores } = require('../../../modules/game_count-down/db/schema.js');

class GameStateRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    // --- Counter (route de l'infini) ---
    async getCounterState(channelId) {
        const [st] = await this.db.select()
            .from(counterState)
            .where(eq(counterState.channelId, channelId))
            .limit(1);
        if (!st) return null;
        return {
            ...st,
            channel_id: st.channelId,
            current_number: st.currentNumber,
            last_user_id: st.lastUserId,
            updated_at: st.updatedAt
        };
    }

    async updateCounterState(channelId, currentNumber, lastUserId) {
        const [updated] = await this.db.insert(counterState)
            .values({ channelId, currentNumber, lastUserId, updatedAt: sql`CURRENT_TIMESTAMP` })
            .onConflictDoUpdate({
                target: counterState.channelId,
                set: { currentNumber, lastUserId, updatedAt: sql`CURRENT_TIMESTAMP` }
            })
            .returning();
        return {
            ...updated,
            channel_id: updated.channelId,
            current_number: updated.currentNumber,
            last_user_id: updated.lastUserId
        };
    }

    // --- Countdown (compte à rebours 900 -> 0) ---
    async getCountdownState(channelId) {
        const [st] = await this.db.select()
            .from(countdownState)
            .where(eq(countdownState.channelId, channelId))
            .limit(1);
        if (!st) return null;
        return {
            ...st,
            channel_id: st.channelId,
            current_number: st.currentNumber,
            is_trap_active: st.isTrapActive,
            trap_number: st.trapNumber,
            last_user_id: st.lastUserId,
            updated_at: st.updatedAt
        };
    }

    async updateCountdownState(channelId, currentNumber, isTrapActive = 0, trapNumber = null, lastUserId = null) {
        const [updated] = await this.db.insert(countdownState)
            .values({
                channelId, currentNumber,
                isTrapActive: isTrapActive ? 1 : 0,
                trapNumber, lastUserId,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: countdownState.channelId,
                set: {
                    currentNumber,
                    isTrapActive: isTrapActive ? 1 : 0,
                    trapNumber, lastUserId,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();
        return {
            ...updated,
            channel_id: updated.channelId,
            current_number: updated.currentNumber,
            is_trap_active: updated.isTrapActive,
            trap_number: updated.trapNumber,
            last_user_id: updated.lastUserId
        };
    }

    async addCountdownScore(channelId, userId, username, points = 1) {
        const [score] = await this.db.insert(countdownScores)
            .values({ channelId, userId, username, score: points })
            .onConflictDoUpdate({
                target: [countdownScores.channelId, countdownScores.userId],
                set: { username, score: sql`${countdownScores.score} + ${points}` }
            })
            .returning();
        return {
            ...score,
            channel_id: score.channelId,
            user_id: score.userId
        };
    }

    async getCountdownScores(channelId, limit = 10) {
        const rows = await this.db.select()
            .from(countdownScores)
            .where(eq(countdownScores.channelId, channelId))
            .orderBy(desc(countdownScores.score))
            .limit(limit);
        return rows.map(r => ({
            ...r,
            channel_id: r.channelId,
            user_id: r.userId
        }));
    }

    async resetCountdownScores(channelId) {
        await this.db.delete(countdownScores)
            .where(eq(countdownScores.channelId, channelId));
        return true;
    }
}

Repository()(GameStateRepository);

module.exports = { GameStateRepository };
