/**
 * db/schemas/shared/discord-cache.repository.js
 *
 * Repository transverse pour le cache des entités Discord.
 * Utilise les tables `discord_channels`, `discord_roles`, `discord_threads`,
 * `discord_messages` (définies dans `cache.js`).
 *
 * Consommé par : DiscordCacheService, dumpDiscord, events Discord.
 *
 * Le code est porté nativement depuis `src/db/legacy-bridge-impl.js`.
 */

const { eq, sql } = require('drizzle-orm');
const { Repository } = require('../../../core/index.js');
const { db, schema } = require('../../index.js');
const { toISOStringSafe } = require('../../../utils/dateUtils.js');
const { discordChannels, discordRoles, discordThreads, discordMessages } = require('./cache.js');

class DiscordCacheRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    async upsertDiscordChannel(channel) {
        if (!channel || !channel.id) return;
        try {
            await this.db.insert(discordChannels)
                .values({
                    channelId: channel.id,
                    guildId: channel.guild?.id || channel.guildId || 'unknown',
                    name: channel.name,
                    type: String(channel.type),
                    parentId: channel.parentId || channel.parent?.id || null,
                    position: channel.position || 0,
                    topic: channel.topic || null,
                    isNsfw: channel.nsfw ? 1 : 0,
                    createdAt: toISOStringSafe(channel.createdAt, new Date().toISOString()),
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: discordChannels.channelId,
                    set: {
                        name: channel.name,
                        type: String(channel.type),
                        parentId: channel.parentId || channel.parent?.id || null,
                        position: channel.position || 0,
                        topic: channel.topic || null,
                        isNsfw: channel.nsfw ? 1 : 0,
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                });
        } catch (e) {
            console.error(`❌ Erreur upsertDiscordChannel(${channel.id}):`, e.message);
        }
    }

    async deleteDiscordChannel(channelId) {
        try {
            await this.db.delete(discordChannels).where(eq(discordChannels.channelId, channelId));
        } catch (e) {
            console.error(`❌ Erreur deleteDiscordChannel(${channelId}):`, e.message);
        }
    }

    async upsertDiscordRole(role) {
        if (!role || !role.id) return;
        try {
            await this.db.insert(discordRoles)
                .values({
                    roleId: role.id,
                    guildId: role.guild?.id || 'unknown',
                    name: role.name,
                    color: role.color || 0,
                    hoist: role.hoist ? 1 : 0,
                    position: role.position || 0,
                    permissions: role.permissions?.bitfield?.toString() || '0',
                    managed: role.managed ? 1 : 0,
                    mentionable: role.mentionable ? 1 : 0,
                    createdAt: toISOStringSafe(role.createdAt, new Date().toISOString()),
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: discordRoles.roleId,
                    set: {
                        name: role.name,
                        color: role.color || 0,
                        hoist: role.hoist ? 1 : 0,
                        position: role.position || 0,
                        permissions: role.permissions?.bitfield?.toString() || '0',
                        managed: role.managed ? 1 : 0,
                        mentionable: role.mentionable ? 1 : 0,
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                });
        } catch (e) {
            console.error(`❌ Erreur upsertDiscordRole(${role.id}):`, e.message);
        }
    }

    async deleteDiscordRole(roleId) {
        try {
            await this.db.delete(discordRoles).where(eq(discordRoles.roleId, roleId));
        } catch (e) {
            console.error(`❌ Erreur deleteDiscordRole(${roleId}):`, e.message);
        }
    }

    async upsertDiscordThread(thread) {
        if (!thread || !thread.id) return;
        try {
            await this.db.insert(discordThreads)
                .values({
                    threadId: thread.id,
                    guildId: thread.guildId || thread.guild?.id || 'unknown',
                    parentId: thread.parentId || thread.parent?.id || 'unknown',
                    name: thread.name,
                    ownerId: thread.ownerId || null,
                    archived: thread.archived ? 1 : 0,
                    locked: thread.locked ? 1 : 0,
                    messageCount: thread.messageCount || 0,
                    memberCount: thread.memberCount || 0,
                    createdAt: toISOStringSafe(thread.createdAt, new Date().toISOString()),
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: discordThreads.threadId,
                    set: {
                        name: thread.name,
                        archived: thread.archived ? 1 : 0,
                        locked: thread.locked ? 1 : 0,
                        messageCount: thread.messageCount || 0,
                        memberCount: thread.memberCount || 0,
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                });
        } catch (e) {
            console.error(`❌ Erreur upsertDiscordThread(${thread.id}):`, e.message);
        }
    }

    async deleteDiscordThread(threadId) {
        try {
            await this.db.delete(discordThreads).where(eq(discordThreads.threadId, threadId));
        } catch (e) {
            console.error(`❌ Erreur deleteDiscordThread(${threadId}):`, e.message);
        }
    }

    async updateDiscordMessage(message) {
        if (!message || !message.id) return;
        try {
            const embeds = (message.embeds || []).map(e => e.toJSON ? e.toJSON() : e);
            const attachments = Array.from(message.attachments?.values() || []).map(a => ({
                id: a.id,
                name: a.name,
                url: a.url,
                contentType: a.contentType
            }));
            const reactions = Array.from(message.reactions?.cache?.values() || []).map(r => ({
                emoji: r.emoji?.name,
                count: r.count
            }));

            await this.db.insert(discordMessages)
                .values({
                    messageId: message.id,
                    channelId: message.channelId,
                    threadId: message.channel?.isThread?.() ? message.channel.id : null,
                    guildId: message.guildId || 'unknown',
                    authorId: message.author?.id || 'unknown',
                    authorUsername: message.author?.username || message.author?.tag || 'Unknown',
                    content: message.content || '',
                    pinned: message.pinned ? 1 : 0,
                    embedsJson: JSON.stringify(embeds),
                    attachmentsJson: JSON.stringify(attachments),
                    reactionsJson: JSON.stringify(reactions),
                    createdAt: toISOStringSafe(message.createdAt, new Date().toISOString()),
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: discordMessages.messageId,
                    set: {
                        content: message.content || '',
                        pinned: message.pinned ? 1 : 0,
                        embedsJson: JSON.stringify(embeds),
                        attachmentsJson: JSON.stringify(attachments),
                        reactionsJson: JSON.stringify(reactions),
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                });
        } catch (e) {
            console.error(`❌ Erreur updateDiscordMessage(${message.id}):`, e.message);
        }
    }

    async deleteDiscordMessage(messageId) {
        try {
            await this.db.delete(discordMessages).where(eq(discordMessages.messageId, messageId));
        } catch (e) {
            console.error(`❌ Erreur deleteDiscordMessage(${messageId}):`, e.message);
        }
    }
}

Repository()(DiscordCacheRepository);

module.exports = { DiscordCacheRepository };
