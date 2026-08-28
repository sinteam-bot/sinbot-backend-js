/**
 * feature_invites/invites.repository.js
 *
 * Repository du feature Invites. Encapsule toutes les opérations Drizzle
 * sur les 5 tables (invite_codes, invite_uses, invite_bonuses,
 * invite_blacklist, invite_restore).
 */

const { eq, and, desc, asc, sql, isNull, isNotNull } = require('drizzle-orm');
const { Repository } = require('../../core/index.js');
const { db, schema } = require('../../db/index.js');
const {
    inviteCodes,
    inviteUses,
    inviteBonuses,
    inviteBlacklist,
    inviteRestore
} = require('./db/schema.js');

class InvitesRepository {
    constructor(dbInstance, schemaInstance) {
        if (!dbInstance) {
            throw new Error('InvitesRepository: dbInstance is required');
        }
        this.db = dbInstance;
        this.schema = schemaInstance;
    }

    // ───────────────────────── invite_codes ─────────────────────────

    async upsertInviteCode(code, guildId, data = {}) {
        const now = Date.now();
        const [row] = await this.db.insert(inviteCodes)
            .values({
                code,
                guildId,
                channelId: data.channelId || null,
                inviterId: data.inviterId || null,
                inviterUsername: data.inviterUsername || null,
                maxUses: data.maxUses ?? 0,
                uses: data.uses ?? 0,
                expiresAt: data.expiresAt || null,
                createdAt: data.createdAt || now,
                updatedAt: now,
                deleted: 0
            })
            .onConflictDoUpdate({
                target: inviteCodes.code,
                set: {
                    channelId: data.channelId || null,
                    inviterId: data.inviterId || null,
                    inviterUsername: data.inviterUsername || null,
                    maxUses: data.maxUses ?? 0,
                    uses: data.uses ?? 0,
                    expiresAt: data.expiresAt || null,
                    updatedAt: now
                }
            })
            .returning();
        return row;
    }

    async markInviteDeleted(code) {
        await this.db.update(inviteCodes)
            .set({ deleted: 1, updatedAt: Date.now() })
            .where(eq(inviteCodes.code, code));
    }

    async getInviteCodes(guildId) {
        return this.db.select()
            .from(inviteCodes)
            .where(and(eq(inviteCodes.guildId, guildId), eq(inviteCodes.deleted, 0)));
    }

    async getInviteByCode(code) {
        const [row] = await this.db.select()
            .from(inviteCodes)
            .where(eq(inviteCodes.code, code))
            .limit(1);
        return row || null;
    }

    // ───────────────────────── invite_uses ─────────────────────────

    async recordInviteUse(data) {
        const [row] = await this.db.insert(inviteUses)
            .values({
                id: data.id || `use_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                guildId: data.guildId,
                inviteCode: data.inviteCode,
                inviterId: data.inviterId,
                inviterUsername: data.inviterUsername || null,
                invitedId: data.invitedId,
                invitedUsername: data.invitedUsername,
                joinedAt: data.joinedAt || Date.now(),
                isFake: data.isFake ? 1 : 0,
                fakeReason: data.fakeReason || null,
                isBot: data.isBot ? 1 : 0,
                isVanity: data.isVanity ? 1 : 0
            })
            .returning();
        return row;
    }

    async getUserInvites(guildId, userId) {
        const rows = await this.db.select()
            .from(inviteUses)
            .where(and(
                eq(inviteUses.guildId, guildId),
                eq(inviteUses.inviterId, userId),
                isNull(inviteUses.leftAt)
            ));
        return rows;
    }

    async getInvitedBy(guildId, userId) {
        return this.db.select()
            .from(inviteUses)
            .where(and(
                eq(inviteUses.guildId, guildId),
                eq(inviteUses.invitedId, userId)
            ));
    }

    async getLeaderboard(guildId, limit = 25) {
        return this.db.select({
            inviterId: inviteUses.inviterId,
            inviterUsername: inviteUses.inviterUsername,
            count: sql`count(*)::int`
        })
        .from(inviteUses)
        .where(and(
            eq(inviteUses.guildId, guildId),
            isNull(inviteUses.leftAt),
            eq(inviteUses.isFake, 0)
        ))
        .groupBy(inviteUses.inviterId, inviteUses.inviterUsername)
        .orderBy(desc(sql`count(*)`))
        .limit(limit);
    }

    async markLeft(guildId, userId) {
        const [row] = await this.db.update(inviteUses)
            .set({ leftAt: Date.now() })
            .where(and(
                eq(inviteUses.guildId, guildId),
                eq(inviteUses.invitedId, userId),
                isNull(inviteUses.leftAt)
            ))
            .returning();
        return row || null;
    }

    // ───────────────────────── invite_bonuses ─────────────────────────

    async addBonus(guildId, userId, amount, reason, moderatorId) {
        const [row] = await this.db.insert(inviteBonuses)
            .values({
                id: `bonus_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                guildId,
                userId,
                amount,
                reason: reason || null,
                moderatorId: moderatorId || null,
                createdAt: Date.now()
            })
            .returning();
        return row;
    }

    async getBonuses(guildId, userId) {
        return this.db.select()
            .from(inviteBonuses)
            .where(and(eq(inviteBonuses.guildId, guildId), eq(inviteBonuses.userId, userId)));
    }

    async resetBonuses(guildId, userId) {
        await this.db.delete(inviteBonuses)
            .where(and(eq(inviteBonuses.guildId, guildId), eq(inviteBonuses.userId, userId)));
    }

    async resetAllInvites(guildId, userId) {
        await this.db.delete(inviteUses)
            .where(and(
                eq(inviteUses.guildId, guildId),
                eq(inviteUses.inviterId, userId)
            ));
        await this.resetBonuses(guildId, userId);
    }

    // ───────────────────────── invite_blacklist ─────────────────────────

    async addBlacklist(guildId, targetId, targetType, reason, moderatorId) {
        await this.db.insert(inviteBlacklist)
            .values({
                guildId, targetId, targetType,
                reason: reason || null,
                moderatorId: moderatorId || null,
                createdAt: Date.now()
            })
            .onConflictDoNothing();
    }

    async removeBlacklist(guildId, targetId) {
        await this.db.delete(inviteBlacklist)
            .where(and(eq(inviteBlacklist.guildId, guildId), eq(inviteBlacklist.targetId, targetId)));
    }

    async getBlacklist(guildId) {
        return this.db.select()
            .from(inviteBlacklist)
            .where(eq(inviteBlacklist.guildId, guildId));
    }

    async isBlacklisted(guildId, targetId) {
        const [row] = await this.db.select()
            .from(inviteBlacklist)
            .where(and(eq(inviteBlacklist.guildId, guildId), eq(inviteBlacklist.targetId, targetId)))
            .limit(1);
        return !!row;
    }

    // ───────────────────────── invite_restore ─────────────────────────

    async snapshotInvites(guildId, userId, totals) {
        const [row] = await this.db.insert(inviteRestore)
            .values({
                id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                guildId,
                userId,
                totalInvites: totals.total || 0,
                realInvites: totals.real || 0,
                bonusInvites: totals.bonus || 0,
                leaves: totals.leaves || 0,
                snapshotAt: Date.now()
            })
            .returning();
        return row;
    }

    async getLatestSnapshot(guildId, userId) {
        const [row] = await this.db.select()
            .from(inviteRestore)
            .where(and(eq(inviteRestore.guildId, guildId), eq(inviteRestore.userId, userId)))
            .orderBy(desc(inviteRestore.snapshotAt))
            .limit(1);
        return row || null;
    }

    async markSnapshotRestored(id) {
        await this.db.update(inviteRestore)
            .set({ restoredAt: Date.now() })
            .where(eq(inviteRestore.id, id));
    }
}

Repository()(InvitesRepository);

module.exports = { InvitesRepository };
