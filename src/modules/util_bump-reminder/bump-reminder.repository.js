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
            id: created?.id,
            guild_id: created?.guildId ?? created?.guild_id ?? guildId,
            channel_id: created?.channelId ?? created?.channel_id ?? channelId,
            bumper_id: created?.userId ?? created?.user_id ?? userId,
            bumper_username: created?.username ?? username,
            bumped_at: created?.bumpedAt ?? created?.bumped_at,
            reminder_sent: created?.reminderSent ?? created?.reminder_sent ?? 0
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
            guild_id: last.guildId ?? last.guild_id,
            channel_id: last.channelId ?? last.channel_id,
            bumper_id: last.userId ?? last.user_id,
            bumper_username: last.username,
            bumped_at: last.bumpedAt ?? last.bumped_at,
            reminder_sent: last.reminderSent ?? last.reminder_sent
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
            guild_id: r.guildId ?? r.guild_id,
            channel_id: r.channelId ?? r.channel_id,
            bumper_id: r.userId ?? r.user_id,
            bumper_username: r.username,
            bumped_at: r.bumpedAt ?? r.bumped_at,
            reminder_sent: r.reminderSent ?? r.reminder_sent
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
            guild_id: r.guildId ?? r.guild_id,
            channel_id: r.channelId ?? r.channel_id,
            bumper_id: r.userId ?? r.user_id,
            bumper_username: r.username,
            bumped_at: r.bumpedAt ?? r.bumped_at,
            reminder_sent: r.reminderSent ?? r.reminder_sent
        }));
    }

    /**
     * Supprime les bumps créés lors des tests unitaires et mocks
     */
    async deleteTestBumps() {
        const { or, like } = require('drizzle-orm');
        return await this.db.delete(this.schema.bumpLogs)
            .where(
                or(
                    eq(this.schema.bumpLogs.guildId, 'test_guild_bump'),
                    eq(this.schema.bumpLogs.channelId, 'test_channel_bump'),
                    like(this.schema.bumpLogs.userId, 'user_bumper%'),
                    eq(this.schema.bumpLogs.username, 'SuperBumper'),
                    eq(this.schema.bumpLogs.username, 'BumperMan'),
                    eq(this.schema.bumpLogs.username, 'TestUser')
                )
            );
    }

    /**
     * Supprime un bump spécifique par son identifiant
     */
    async deleteBump(bumpId) {
        return await this.db.delete(this.schema.bumpLogs)
            .where(eq(this.schema.bumpLogs.id, Number(bumpId)));
    }
}

Repository()(BumpReminderRepository);

module.exports = {
    BumpReminderRepository
};
