const { eq, and, desc, sql } = require('drizzle-orm');
const { db, schema } = require('../../db/index.js');
const { Repository } = require('../../core/index.js');
const { toISOStringSafe } = require('../../utils/dateUtils.js');

class BumpReminderRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    /**
     * Enregistre un bump Disboard dans bump_logs
     */
    async saveBump(guildId, channelId, userId, username) {
        const now = new Date();

        const [created] = await this.db.insert(this.schema.bumpLogs)
            .values({
                guildId,
                channelId,
                userId,
                username,
                bumpedAt: toISOStringSafe(now),
                reminderSent: 0
            })
            .returning();

        return {
            ...created,
            id: created.id,
            guild_id: created.guildId,
            channel_id: created.channelId,
            bumper_id: created.userId,
            bumper_username: created.username,
            bumped_at: created.bumpedAt,
            reminder_sent: created.reminderSent
        };
    }

    /**
     * Récupère le dernier bump enregistré
     */
    async getLastBump(guildId = null) {
        let query = this.db.select().from(this.schema.bumpLogs);

        if (guildId && guildId !== 'unknown') {
            query = query.where(eq(this.schema.bumpLogs.guildId, guildId));
        }

        const [last] = await query
            .orderBy(desc(this.schema.bumpLogs.id))
            .limit(1);

        if (!last) return null;

        return {
            ...last,
            id: last.id,
            guild_id: last.guildId,
            channel_id: last.channelId,
            bumper_id: last.userId,
            bumper_username: last.username,
            bumped_at: last.bumpedAt,
            reminder_sent: last.reminderSent
        };
    }

    /**
     * Marque un rappel comme envoyé
     */
    async markReminderSent(bumpId) {
        await this.db.update(this.schema.bumpLogs)
            .set({
                reminderSent: 1,
                reminderSentAt: toISOStringSafe(new Date())
            })
            .where(eq(this.schema.bumpLogs.id, bumpId));
    }

    /**
     * Récupère les bumps non encore rappelés
     */
    async getPendingReminders() {
        const rows = await this.db.select()
            .from(this.schema.bumpLogs)
            .where(eq(this.schema.bumpLogs.reminderSent, 0))
            .orderBy(desc(this.schema.bumpLogs.id))
            .limit(5);

        return rows.map(r => ({
            ...r,
            id: r.id,
            guild_id: r.guildId,
            channel_id: r.channelId,
            bumper_id: r.userId,
            bumper_username: r.username,
            bumped_at: r.bumpedAt,
            reminder_sent: r.reminderSent
        }));
    }

    /**
     * Historique des bumps récents
     */
    async getHistory(limit = 20) {
        const rows = await this.db.select()
            .from(this.schema.bumpLogs)
            .orderBy(desc(this.schema.bumpLogs.id))
            .limit(limit);

        return rows.map(r => ({
            ...r,
            id: r.id,
            guild_id: r.guildId,
            channel_id: r.channelId,
            bumper_id: r.userId,
            bumper_username: r.username,
            bumped_at: r.bumpedAt,
            reminder_sent: r.reminderSent
        }));
    }
}

Repository()(BumpReminderRepository);

module.exports = {
    BumpReminderRepository
};
