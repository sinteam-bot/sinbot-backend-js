/**
 * db/schemas/shared/members.repository.js
 *
 * Repository transverse pour la gestion des membres du serveur.
 * Utilise les tables `server_members` et `member_history` (définies dans
 * `cache.js`) + `guild_members` (legacy).
 *
 * Consommé par : DiscordCacheService, events/messageCreate, modules logs.
 *
 * Le code est porté nativement depuis `src/db/legacy-bridge-impl.js`.
 */

const { eq, desc, sql } = require('drizzle-orm');
const { Repository } = require('../../../core/index.js');
const { db, schema } = require('../../index.js');
const { toISOStringSafe } = require('../../../utils/dateUtils.js');
const { serverMembers, memberHistory, guildMembers } = require('./cache.js');

class MembersRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    async registerNewMember(memberData) {
        try {
            const joinedAtStr = toISOStringSafe(memberData.joined_at, new Date().toISOString());
            const accountCreatedAtStr = toISOStringSafe(memberData.account_created_at, null);
            const rolesPayload = Array.isArray(memberData.roles) ? JSON.stringify(memberData.roles) : memberData.roles;

            const [existing] = await this.db.select()
                .from(serverMembers)
                .where(eq(serverMembers.userId, memberData.user_id))
                .limit(1);

            let member;
            if (existing) {
                [member] = await this.db.update(serverMembers)
                    .set({
                        username: memberData.username,
                        discriminator: memberData.discriminator,
                        tag: memberData.tag,
                        displayName: memberData.display_name,
                        avatarUrl: memberData.avatar_url,
                        joinedAt: joinedAtStr,
                        isBot: memberData.is_bot ? 1 : 0,
                        rejoinCount: sql`${serverMembers.rejoinCount} + 1`,
                        leftAt: null,
                        roles: rolesPayload,
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    })
                    .where(eq(serverMembers.userId, memberData.user_id))
                    .returning();
            } else {
                [member] = await this.db.insert(serverMembers)
                    .values({
                        userId: memberData.user_id,
                        username: memberData.username,
                        discriminator: memberData.discriminator,
                        tag: memberData.tag,
                        displayName: memberData.display_name,
                        avatarUrl: memberData.avatar_url,
                        joinedAt: joinedAtStr,
                        accountCreatedAt: accountCreatedAtStr,
                        isBot: memberData.is_bot ? 1 : 0,
                        roles: rolesPayload
                    })
                    .returning();
            }

            await this.logMemberEvent(memberData.user_id, memberData.username, 'join', memberData.guild_id, {
                is_rejoin: !!existing,
                rejoin_count: member?.rejoinCount || (existing ? existing.rejoinCount + 1 : 0)
            });

            return member;
        } catch (error) {
            console.error('❌ Erreur registerNewMember:', error);
            throw error;
        }
    }

    async logMemberEvent(userId, username, action, guildId, metadata = {}) {
        try {
            let safeUsername = username;
            let safeGuildId = guildId || process.env.GUILD_ID || 'unknown';

            if (!safeUsername && userId) {
                try {
                    const [existing] = await this.db.select({ username: serverMembers.username })
                        .from(serverMembers)
                        .where(eq(serverMembers.userId, userId))
                        .limit(1);
                    if (existing && existing.username) {
                        safeUsername = existing.username;
                    }
                } catch (e) {
                    console.warn('[MembersRepository] Impossible de récupérer le username pour logMemberEvent:', e.message);
                }
            }

            safeUsername = safeUsername || 'Inconnu';

            const [entry] = await this.db.insert(memberHistory)
                .values({
                    userId: String(userId),
                    username: safeUsername,
                    action: action || 'event',
                    guildId: safeGuildId,
                    metadata: JSON.stringify(metadata || {})
                })
                .returning();

            return entry;
        } catch (error) {
            console.error('❌ Erreur logMemberEvent:', error);
            throw error;
        }
    }

    async updateMemberRoles(userId, roles) {
        try {
            const rolesPayload = Array.isArray(roles) ? JSON.stringify(roles) : roles;
            const [updated] = await this.db.update(serverMembers)
                .set({
                    roles: rolesPayload,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .where(eq(serverMembers.userId, userId))
                .returning();

            return updated;
        } catch (error) {
            console.error('❌ Erreur updateMemberRoles:', error);
            throw error;
        }
    }

    async markMemberLeft(userId, username, guildId) {
        try {
            let safeUsername = username;
            let safeGuildId = guildId || process.env.GUILD_ID || 'unknown';

            if (!safeUsername && userId) {
                try {
                    const [existing] = await this.db.select({ username: serverMembers.username })
                        .from(serverMembers)
                        .where(eq(serverMembers.userId, userId))
                        .limit(1);
                    if (existing && existing.username) {
                        safeUsername = existing.username;
                    }
                } catch (e) {
                    console.warn('[MembersRepository] Impossible de récupérer le username pour markMemberLeft:', e.message);
                }
            }

            safeUsername = safeUsername || 'Inconnu';

            const [updated] = await this.db.update(serverMembers)
                .set({
                    leftAt: sql`CURRENT_TIMESTAMP`,
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    presence: 'offline',
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .where(eq(serverMembers.userId, userId))
                .returning();

            await this.logMemberEvent(userId, safeUsername, 'leave', safeGuildId);
            return updated;
        } catch (error) {
            console.error('❌ Erreur markMemberLeft:', error);
            throw error;
        }
    }

    async getMemberInfo(userId) {
        try {
            const [member] = await this.db.select()
                .from(serverMembers)
                .where(eq(serverMembers.userId, userId))
                .limit(1);

            if (!member) return null;

            let parsedRoles = [];
            if (member.roles) {
                try {
                    parsedRoles = JSON.parse(member.roles);
                } catch {
                    parsedRoles = member.roles.split(',');
                }
            }

            return {
                ...member,
                user_id: member.userId,
                display_name: member.displayName,
                avatar_url: member.avatarUrl,
                joined_at: member.joinedAt,
                account_created_at: member.accountCreatedAt,
                is_bot: member.isBot,
                rejoin_count: member.rejoinCount,
                left_at: member.leftAt,
                roles: parsedRoles
            };
        } catch (error) {
            console.error('❌ Erreur getMemberInfo:', error);
            throw error;
        }
    }

    async getRecentMembers(limit = 20) {
        try {
            const rows = await this.db.select()
                .from(serverMembers)
                .orderBy(desc(serverMembers.joinedAt))
                .limit(limit);

            return rows.map(m => {
                let parsedRoles = [];
                if (m.roles) {
                    try {
                        parsedRoles = JSON.parse(m.roles);
                    } catch {
                        parsedRoles = m.roles.split(',');
                    }
                }
                return {
                    ...m,
                    user_id: m.userId,
                    display_name: m.displayName,
                    avatar_url: m.avatarUrl,
                    joined_at: m.joinedAt,
                    account_created_at: m.accountCreatedAt,
                    is_bot: m.isBot,
                    rejoin_count: m.rejoinCount,
                    left_at: m.leftAt,
                    roles: parsedRoles
                };
            });
        } catch (error) {
            console.error('❌ Erreur getRecentMembers:', error);
            throw error;
        }
    }

    async getMemberHistory(userId, limit = 50) {
        try {
            const rows = await this.db.select()
                .from(memberHistory)
                .where(eq(memberHistory.userId, userId))
                .orderBy(desc(memberHistory.createdAt))
                .limit(limit);

            return rows.map(h => ({
                ...h,
                user_id: h.userId,
                guild_id: h.guildId,
                metadata: h.metadata ? JSON.parse(h.metadata) : null
            }));
        } catch (error) {
            console.error('❌ Erreur getMemberHistory:', error);
            throw error;
        }
    }

    async addGuildMember(userId, username) {
        try {
            const [member] = await this.db.insert(guildMembers)
                .values({ userId, username })
                .onConflictDoUpdate({
                    target: guildMembers.userId,
                    set: { username }
                })
                .returning();

            return member;
        } catch (error) {
            console.error('❌ Erreur addGuildMember:', error);
            throw error;
        }
    }
}

Repository()(MembersRepository);

module.exports = { MembersRepository };
