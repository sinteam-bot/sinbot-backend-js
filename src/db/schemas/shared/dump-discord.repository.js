/**
 * db/schemas/shared/dump-discord.repository.js
 *
 * Repository transverse pour le dump Discord (utilisé par `src/dumpDiscord.js`).
 * Utilise les tables `discord_users`, `discord_channels`, `discord_threads`,
 * `discord_messages` (définies dans `cache.js`).
 *
 * Le code est porté nativement depuis `src/db/legacy-bridge-impl.js`.
 */

const { sql } = require('drizzle-orm');
const { Repository } = require('../../../core/index.js');
const { db, schema } = require('../../index.js');
const { toISOStringSafe } = require('../../../utils/dateUtils.js');
const { discordUsers, discordChannels, discordThreads, discordMessages } = require('./cache.js');

class DumpDiscordRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    async saveDumpUser(user) {
        if (!user || !user.id) return;
        try {
            await this.db.insert(discordUsers)
                .values({
                    userId: user.id,
                    username: user.username || user.tag || 'Unknown',
                    globalName: user.globalName || null,
                    discriminator: user.discriminator || '0',
                    bot: user.bot ? 1 : 0,
                    avatarUrl: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : user.avatarURL || null,
                    bannerUrl: user.bannerURL ? user.bannerURL({ dynamic: true }) : null,
                    createdAt: toISOStringSafe(user.createdAt, new Date().toISOString()),
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: discordUsers.userId,
                    set: {
                        username: user.username || user.tag || 'Unknown',
                        globalName: user.globalName || null,
                        discriminator: user.discriminator || '0',
                        bot: user.bot ? 1 : 0,
                        avatarUrl: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : user.avatarURL || null,
                        bannerUrl: user.bannerURL ? user.bannerURL({ dynamic: true }) : null,
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                });
        } catch (e) {
            console.error(`❌ Erreur saveDumpUser(${user.id}):`, e.message);
        }
    }

    async saveDumpChannel(channel) {
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
            console.error(`❌ Erreur saveDumpChannel(${channel.id}):`, e.message);
        }
    }

    async saveDumpThread(thread) {
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
            console.error(`❌ Erreur saveDumpThread(${thread.id}):`, e.message);
        }
    }

    async saveDumpMessagesBatch(messages) {
        if (!messages || messages.length === 0) return;
        try {
            for (const msg of messages) {
                const embeds = (msg.embeds || []).map(e => e.toJSON ? e.toJSON() : e);
                const attachments = Array.from(msg.attachments?.values() || []).map(a => ({
                    id: a.id,
                    name: a.name,
                    url: a.url,
                    contentType: a.contentType
                }));
                const reactions = Array.from(msg.reactions?.cache?.values() || []).map(r => ({
                    emoji: r.emoji?.name,
                    count: r.count
                }));

                await this.db.insert(discordMessages)
                    .values({
                        messageId: msg.id,
                        channelId: msg.channelId,
                        threadId: msg.channel?.isThread?.() ? msg.channel.id : null,
                        guildId: msg.guildId || msg.guild?.id || 'unknown',
                        authorId: msg.author?.id || 'unknown',
                        authorUsername: msg.author?.username || msg.author?.tag || 'Unknown',
                        content: msg.content || '',
                        pinned: msg.pinned ? 1 : 0,
                        embedsJson: JSON.stringify(embeds),
                        attachmentsJson: JSON.stringify(attachments),
                        reactionsJson: JSON.stringify(reactions),
                        createdAt: toISOStringSafe(msg.createdAt, new Date().toISOString()),
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    })
                    .onConflictDoUpdate({
                        target: discordMessages.messageId,
                        set: {
                            content: msg.content || '',
                            pinned: msg.pinned ? 1 : 0,
                            embedsJson: JSON.stringify(embeds),
                            attachmentsJson: JSON.stringify(attachments),
                            reactionsJson: JSON.stringify(reactions),
                            updatedAt: sql`CURRENT_TIMESTAMP`
                        }
                    });
            }
        } catch (e) {
            console.error('❌ Erreur saveDumpMessagesBatch:', e.message);
        }
    }
}

Repository()(DumpDiscordRepository);

module.exports = { DumpDiscordRepository };
