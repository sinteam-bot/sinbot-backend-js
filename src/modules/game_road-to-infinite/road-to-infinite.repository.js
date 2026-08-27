const { eq, desc, sql } = require('drizzle-orm');
const { db, schema } = require('../../db/index.js');
const { Repository } = require('../../core/index.js');

class RoadToInfiniteRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    /**
     * Récupère l'état courant du compteur pour un salon donné
     * @param {string} channelId
     */
    async getState(channelId) {
        const [state] = await this.db.select()
            .from(this.schema.counterState)
            .where(eq(this.schema.counterState.channelId, channelId))
            .limit(1);

        if (!state) return null;
        return {
            ...state,
            channel_id: state.channelId,
            current_number: state.currentNumber,
            error_count: state.errorCount ?? 0,
            last_user_id: state.lastUserId,
            updated_at: state.updatedAt
        };
    }

    /**
     * Met à jour ou initialise l'état du compteur
     * @param {string} channelId
     * @param {number} currentNumber
     * @param {string|null} lastUserId
     * @param {number} [errorCount=0]
     */
    async updateState(channelId, currentNumber, lastUserId = null, errorCount = 0) {
        const [updated] = await this.db.insert(this.schema.counterState)
            .values({
                channelId,
                currentNumber,
                errorCount,
                lastUserId,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: this.schema.counterState.channelId,
                set: {
                    currentNumber,
                    errorCount,
                    lastUserId,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();

        return {
            ...updated,
            channel_id: updated.channelId,
            current_number: updated.currentNumber,
            error_count: updated.errorCount ?? 0,
            last_user_id: updated.lastUserId
        };
    }

    /**
     * Ajoute un point au score d'un joueur
     * @param {string} channelId
     * @param {string} userId
     * @param {string} username
     * @param {number} [points=1]
     */
    async addScore(channelId, userId, username, points = 1) {
        const [score] = await this.db.insert(this.schema.countdownScores)
            .values({
                channelId,
                userId,
                username,
                score: points
            })
            .onConflictDoUpdate({
                target: [this.schema.countdownScores.channelId, this.schema.countdownScores.userId],
                set: {
                    username,
                    score: sql`${this.schema.countdownScores.score} + ${points}`
                }
            })
            .returning();

        return score;
    }

    /**
     * Récupère le classement des joueurs
     * @param {string} channelId
     * @param {number} [limit=10]
     */
    async getScores(channelId, limit = 10) {
        const rows = await this.db.select()
            .from(this.schema.countdownScores)
            .where(eq(this.schema.countdownScores.channelId, channelId))
            .orderBy(desc(this.schema.countdownScores.score))
            .limit(limit);

        return rows.map(r => ({
            ...r,
            channel_id: r.channelId,
            user_id: r.userId
        }));
    }

    /**
     * Réinitialise les scores de la session
     * @param {string} channelId
     */
    async resetScores(channelId) {
        await this.db.delete(this.schema.countdownScores)
            .where(eq(this.schema.countdownScores.channelId, channelId));
        return true;
    }
}

Repository()(RoadToInfiniteRepository);

module.exports = {
    RoadToInfiniteRepository
};
