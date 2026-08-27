const { pool } = require('../database.js');
const { toISOStringSafe } = require('../utils/dateUtils.js');
const logger = require('../utils/logger.js');

/**
 * Service centralisé pour mettre en cache l'ensemble des données Discord en Base de Données
 * (Émojis, Rôles, Salons, Utilisateurs, Membres, Messages, Avatars, Pseudos, Couleurs)
 * avec prise en charge du Soft Delete (conservation de l'historique et des références)
 */
class DiscordCacheService {
    /**
     * Génère l'URL d'avatar appropriée pour un utilisateur / membre
     */
    static getUserAvatar(user, member = null) {
        if (member && member.avatar) {
            return `https://cdn.discordapp.com/guilds/${member.guild.id}/users/${user.id}/avatars/${member.avatar}.png?size=128`;
        }
        if (user && user.avatar) {
            const isAnimated = user.avatar.startsWith('a_');
            const ext = isAnimated ? 'gif' : 'png';
            return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
        }
        const defaultIndex = user ? (Number(user.id) % 5) : 0;
        return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    }

    /**
     * Met en cache l'ensemble des émojis personnalisés du serveur Discord
     */
    static async cacheGuildEmojis(guild) {
        if (!guild || !guild.emojis) return 0;

        try {
            const emojis = Array.from(guild.emojis.cache.values());
            if (emojis.length === 0) return 0;

            for (const e of emojis) {
                const url = e.imageURL
                    ? (typeof e.imageURL === 'function' ? e.imageURL({ extension: e.animated ? 'gif' : 'png', size: 64 }) : e.imageURL)
                    : `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=64&quality=lossless`;

                const rolesJson = JSON.stringify(e.roles?.cache ? Array.from(typeof e.roles.cache.keys === 'function' ? e.roles.cache.keys() : Object.keys(e.roles.cache)) : []);

                await pool.query(`
                    INSERT INTO discord_emojis (emoji_id, guild_id, name, animated, url, roles_json, created_at, deleted_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, CURRENT_TIMESTAMP)
                    ON CONFLICT (emoji_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        animated = EXCLUDED.animated,
                        url = EXCLUDED.url,
                        roles_json = EXCLUDED.roles_json,
                        deleted_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    e.id,
                    guild.id,
                    e.name,
                    e.animated ? 1 : 0,
                    url,
                    rolesJson,
                    toISOStringSafe(e.createdAt, null)
                ]);
            }

            return emojis.length;
        } catch (error) {
            logger.error(`Erreur cacheGuildEmojis: ${error.message}`, 'CACHE');
            return 0;
        }
    }

    /**
     * Met en cache l'ensemble des rôles du serveur Discord
     */
    static async cacheGuildRoles(guild) {
        if (!guild || !guild.roles) return 0;

        try {
            const roles = Array.from(guild.roles.cache.values()).filter(r => r.id !== guild.id);
            if (roles.length === 0) return 0;

            for (const r of roles) {
                const colorHex = (r.color && r.color !== 0) ? `#${r.color.toString(16).padStart(6, '0')}` : null;
                const iconUrl = r.iconURL ? (typeof r.iconURL === 'function' ? r.iconURL({ size: 64 }) : r.iconURL) : null;
                const unicodeEmoji = r.unicodeEmoji || null;
                const memberCount = r.members ? (r.members.size !== undefined ? r.members.size : (Array.isArray(r.members) ? r.members.length : 0)) : 0;
                const permissionsStr = r.permissions?.bitfield !== undefined ? String(r.permissions.bitfield) : (r.permissions !== undefined ? String(r.permissions) : '0');

                await pool.query(`
                    INSERT INTO discord_roles (
                        role_id, guild_id, name, color, color_hex, icon_url, unicode_emoji,
                        member_count, hoist, position, permissions, managed, mentionable, created_at, deleted_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NULL, CURRENT_TIMESTAMP)
                    ON CONFLICT (role_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        color = EXCLUDED.color,
                        color_hex = EXCLUDED.color_hex,
                        icon_url = EXCLUDED.icon_url,
                        unicode_emoji = EXCLUDED.unicode_emoji,
                        member_count = EXCLUDED.member_count,
                        hoist = EXCLUDED.hoist,
                        position = EXCLUDED.position,
                        permissions = EXCLUDED.permissions,
                        managed = EXCLUDED.managed,
                        mentionable = EXCLUDED.mentionable,
                        deleted_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    r.id,
                    guild.id,
                    r.name,
                    r.color || 0,
                    colorHex,
                    iconUrl,
                    unicodeEmoji,
                    memberCount,
                    r.hoist ? 1 : 0,
                    r.position || 0,
                    permissionsStr,
                    r.managed ? 1 : 0,
                    r.mentionable ? 1 : 0,
                    toISOStringSafe(r.createdAt, null)
                ]);
            }

            return roles.length;
        } catch (error) {
            logger.error(`Erreur cacheGuildRoles: ${error.message}`, 'CACHE');
            return 0;
        }
    }

    /**
     * Met en cache les salons textuels, vocaux, catégories et threads
     */
    static async cacheGuildChannels(guild) {
        if (!guild || !guild.channels) return 0;

        try {
            const channels = Array.from(guild.channels.cache.values());
            if (channels.length === 0) return 0;

            for (const ch of channels) {
                if (ch.isThread && (typeof ch.isThread === 'function' ? ch.isThread() : ch.isThread)) {
                    await pool.query(`
                        INSERT INTO discord_threads (
                            thread_id, guild_id, parent_id, name, owner_id, archived,
                            locked, message_count, member_count, created_at, deleted_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, CURRENT_TIMESTAMP)
                        ON CONFLICT (thread_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            archived = EXCLUDED.archived,
                            locked = EXCLUDED.locked,
                            message_count = EXCLUDED.message_count,
                            member_count = EXCLUDED.member_count,
                            deleted_at = NULL,
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        ch.id,
                        guild.id,
                        ch.parentId || '',
                        ch.name,
                        ch.ownerId || null,
                        ch.archived ? 1 : 0,
                        ch.locked ? 1 : 0,
                        ch.messageCount || 0,
                        ch.memberCount || 0,
                        toISOStringSafe(ch.createdAt, null)
                    ]);
                } else {
                    await pool.query(`
                        INSERT INTO discord_channels (
                            channel_id, guild_id, name, type, parent_id, position, topic, is_nsfw, created_at, deleted_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, CURRENT_TIMESTAMP)
                        ON CONFLICT (channel_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            type = EXCLUDED.type,
                            parent_id = EXCLUDED.parent_id,
                            position = EXCLUDED.position,
                            topic = EXCLUDED.topic,
                            is_nsfw = EXCLUDED.is_nsfw,
                            deleted_at = NULL,
                            updated_at = CURRENT_TIMESTAMP
                    `, [
                        ch.id,
                        guild.id,
                        ch.name,
                        String(ch.type),
                        ch.parentId || null,
                        ch.position || 0,
                        ch.topic || null,
                        ch.nsfw ? 1 : 0,
                        toISOStringSafe(ch.createdAt, null)
                    ]);
                }
            }

            return channels.length;
        } catch (error) {
            logger.error(`Erreur cacheGuildChannels: ${error.message}`, 'CACHE');
            return 0;
        }
    }

    /**
     * Met en cache l'ensemble des membres du serveur
     */
    static async cacheGuildMembers(guild) {
        if (!guild) return 0;

        try {
            try {
                if (typeof guild.members.fetch === 'function') {
                    await guild.members.fetch().catch(() => {});
                }
            } catch (e) {}

            const members = Array.from(guild.members.cache.values());
            if (members.length === 0) return 0;

            for (const member of members) {
                await this.cacheSingleMember(member, guild);
            }

            return members.length;
        } catch (error) {
            logger.error(`Erreur cacheGuildMembers: ${error.message}`, 'CACHE');
            return 0;
        }
    }

    /**
     * Met en cache un seul membre Discord
     */
    static async cacheSingleMember(member, guild = null) {
        if (!member || !member.user) return;
        const g = guild || member.guild;

        try {
            const user = member.user;
            const highestRole = member.roles?.highest || null;
            const roleColor = (member.displayColor && member.displayColor !== 0)
                ? `#${member.displayColor.toString(16).padStart(6, '0')}`
                : null;

            const rolesCache = member.roles?.cache
                ? (typeof member.roles.cache.values === 'function' ? Array.from(member.roles.cache.values()) : Array.from(member.roles.cache))
                : [];

            const roles = rolesCache
                .filter(r => r && r.id !== (g ? g.id : ''))
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    color: (r.color && r.color !== 0) ? `#${r.color.toString(16).padStart(6, '0')}` : null,
                    rawColor: r.color || 0,
                    position: r.position || 0,
                    icon: r.iconURL ? (typeof r.iconURL === 'function' ? r.iconURL({ size: 64 }) : r.iconURL) : null,
                    unicodeEmoji: r.unicodeEmoji || null,
                    hoist: r.hoist ? 1 : 0
                }))
                .sort((a, b) => (b.position || 0) - (a.position || 0));

            const avatarUrl = this.getUserAvatar(user, member);
            const bannerUrl = user.bannerURL ? user.bannerURL({ size: 512 }) : null;
            const presence = member.presence ? member.presence.status : 'offline';

            // 1. Mettre à jour discord_users
            await pool.query(`
                INSERT INTO discord_users (
                    user_id, username, global_name, discriminator, bot, avatar_url, banner_url, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE SET
                    username = EXCLUDED.username,
                    global_name = EXCLUDED.global_name,
                    discriminator = EXCLUDED.discriminator,
                    bot = EXCLUDED.bot,
                    avatar_url = EXCLUDED.avatar_url,
                    banner_url = EXCLUDED.banner_url,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                user.id,
                user.username,
                user.globalName || user.username,
                user.discriminator || '0000',
                user.bot ? 1 : 0,
                avatarUrl,
                bannerUrl,
                toISOStringSafe(user.createdAt, null)
            ]);

            // 2. Mettre à jour server_members
            await pool.query(`
                INSERT INTO server_members (
                    user_id, username, discriminator, tag, display_name, avatar_url,
                    display_color, highest_role_id, highest_role_name, highest_role_color,
                    joined_at, account_created_at, is_bot, roles, presence, deleted_at, left_at, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE SET
                    username = EXCLUDED.username,
                    discriminator = EXCLUDED.discriminator,
                    tag = EXCLUDED.tag,
                    display_name = EXCLUDED.display_name,
                    avatar_url = EXCLUDED.avatar_url,
                    display_color = EXCLUDED.display_color,
                    highest_role_id = EXCLUDED.highest_role_id,
                    highest_role_name = EXCLUDED.highest_role_name,
                    highest_role_color = EXCLUDED.highest_role_color,
                    joined_at = EXCLUDED.joined_at,
                    account_created_at = EXCLUDED.account_created_at,
                    is_bot = EXCLUDED.is_bot,
                    roles = EXCLUDED.roles,
                    presence = EXCLUDED.presence,
                    deleted_at = NULL,
                    left_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                user.id,
                user.username,
                user.discriminator || '0000',
                user.tag || `${user.username}#${user.discriminator || '0000'}`,
                member.displayName || user.username,
                avatarUrl,
                roleColor,
                highestRole ? highestRole.id : null,
                highestRole ? highestRole.name : null,
                roleColor,
                toISOStringSafe(member.joinedAt, null),
                toISOStringSafe(user.createdAt, null),
                user.bot ? 1 : 0,
                JSON.stringify(roles),
                presence
            ]);
        } catch (error) {
            logger.error(`Erreur cacheSingleMember (${member.id}): ${error.message}`, 'CACHE');
        }
    }

    /**
     * Met en cache un message Discord reçu
     */
    static async cacheDiscordMessage(message) {
        if (!message || !message.id) return;

        try {
            const embedsJson = message.embeds && message.embeds.length > 0
                ? JSON.stringify(message.embeds.map(e => (typeof e.toJSON === 'function' ? e.toJSON() : e)))
                : null;

            const attachmentsJson = message.attachments && message.attachments.size > 0
                ? JSON.stringify(Array.from(message.attachments.values()).map(a => ({
                    id: a.id,
                    name: a.name,
                    url: a.url,
                    proxyURL: a.proxyURL,
                    size: a.size,
                    contentType: a.contentType
                })))
                : null;

            const reactionsJson = message.reactions && message.reactions.cache?.size > 0
                ? JSON.stringify(Array.from(message.reactions.cache.values()).map(r => ({
                    emoji: r.emoji.name,
                    id: r.emoji.id,
                    count: r.count,
                    animated: r.emoji.animated,
                    url: r.emoji.imageURL ? (typeof r.emoji.imageURL === 'function' ? r.emoji.imageURL({ size: 64 }) : r.emoji.imageURL) : null
                })))
                : null;

            const channelId = message.channel ? message.channel.id : 'unknown';
            const threadId = (message.channel && message.channel.isThread && (typeof message.channel.isThread === 'function' ? message.channel.isThread() : message.channel.isThread)) ? message.channel.id : null;
            const guildId = message.guild ? message.guild.id : (process.env.GUILD_ID || 'unknown');
            const authorId = message.author ? message.author.id : 'unknown';
            const authorUsername = message.author ? (message.author.username || 'Inconnu') : 'Inconnu';

            await pool.query(`
                INSERT INTO discord_messages (
                    message_id, channel_id, thread_id, guild_id, author_id, author_username,
                    content, pinned, embeds_json, attachments_json, reactions_json, created_at, deleted_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, CURRENT_TIMESTAMP)
                ON CONFLICT (message_id) DO UPDATE SET
                    content = EXCLUDED.content,
                    pinned = EXCLUDED.pinned,
                    embeds_json = EXCLUDED.embeds_json,
                    attachments_json = EXCLUDED.attachments_json,
                    reactions_json = EXCLUDED.reactions_json,
                    deleted_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                message.id,
                channelId,
                threadId,
                guildId,
                authorId,
                authorUsername,
                message.content || '',
                message.pinned ? 1 : 0,
                embedsJson,
                attachmentsJson,
                reactionsJson,
                toISOStringSafe(message.createdAt, new Date().toISOString())
            ]);

            // Si c'est un membre du serveur, mettre aussi à jour le cache de l'auteur
            if (message.member) {
                await this.cacheSingleMember(message.member, message.guild);
            }
        } catch (error) {
            logger.error(`Erreur cacheDiscordMessage (${message.id}): ${error.message}`, 'CACHE');
        }
    }

    /**
     * Soft delete d'un émoji personnalisé
     */
    static async softDeleteEmoji(emojiId) {
        if (!emojiId) return;
        try {
            await pool.query(`UPDATE discord_emojis SET deleted_at = CURRENT_TIMESTAMP WHERE emoji_id = $1`, [emojiId]);
        } catch (error) {
            logger.error(`Erreur softDeleteEmoji (${emojiId}): ${error.message}`, 'CACHE');
        }
    }

    /**
     * Soft delete d'un rôle Discord
     */
    static async softDeleteRole(roleId) {
        if (!roleId) return;
        try {
            await pool.query(`UPDATE discord_roles SET deleted_at = CURRENT_TIMESTAMP WHERE role_id = $1`, [roleId]);
        } catch (error) {
            logger.error(`Erreur softDeleteRole (${roleId}): ${error.message}`, 'CACHE');
        }
    }

    /**
     * Soft delete d'un salon ou fil Discord
     */
    static async softDeleteChannel(channelId) {
        if (!channelId) return;
        try {
            await pool.query(`UPDATE discord_channels SET deleted_at = CURRENT_TIMESTAMP WHERE channel_id = $1`, [channelId]);
            await pool.query(`UPDATE discord_threads SET deleted_at = CURRENT_TIMESTAMP WHERE thread_id = $1`, [channelId]);
        } catch (error) {
            logger.error(`Erreur softDeleteChannel (${channelId}): ${error.message}`, 'CACHE');
        }
    }

    /**
     * Soft delete d'un message Discord
     */
    static async softDeleteMessage(messageId) {
        if (!messageId) return;
        try {
            await pool.query(`UPDATE discord_messages SET deleted_at = CURRENT_TIMESTAMP WHERE message_id = $1`, [messageId]);
        } catch (error) {
            logger.error(`Erreur softDeleteMessage (${messageId}): ${error.message}`, 'CACHE');
        }
    }

    /**
     * Soft delete en masse de messages Discord
     */
    static async softDeleteMessages(messageIds) {
        if (!messageIds || messageIds.length === 0) return;
        try {
            for (const id of messageIds) {
                await pool.query(`UPDATE discord_messages SET deleted_at = CURRENT_TIMESTAMP WHERE message_id = $1`, [id]);
            }
        } catch (error) {
            logger.error(`Erreur softDeleteMessages: ${error.message}`, 'CACHE');
        }
    }

    /**
     * Soft delete / départ d'un membre Discord
     */
    static async softDeleteMember(userId) {
        if (!userId) return;
        try {
            await pool.query(`
                UPDATE server_members
                SET left_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP, presence = 'offline'
                WHERE user_id = $1
            `, [userId]);
        } catch (error) {
            logger.error(`Erreur softDeleteMember (${userId}): ${error.message}`, 'CACHE');
        }
    }

    /**
     * Effectue une synchronisation complète de l'ensemble des données Discord en BDD
     */
    static async syncAllDiscordCache(guild) {
        if (!guild) return;

        console.log(`🔄 [Discord Cache] Début de la synchronisation BDD pour la guilde "${guild.name}"...`);
        const startTime = Date.now();

        try {
            const [emojisCount, rolesCount, channelsCount, membersCount] = await Promise.all([
                this.cacheGuildEmojis(guild),
                this.cacheGuildRoles(guild),
                this.cacheGuildChannels(guild),
                this.cacheGuildMembers(guild)
            ]);

            const elapsed = Date.now() - startTime;
            console.log(`💾 [Discord Cache] Synchronisation BDD terminée en ${elapsed}ms :`);
            console.log(`   ├─ 🎨 ${emojisCount} émojis personnalisés mis en cache`);
            console.log(`   ├─ 🏷️  ${rolesCount} rôles mis en cache (couleurs, icônes, hiérarchie)`);
            console.log(`   ├─ 💬 ${channelsCount} salons & fils mis en cache`);
            console.log(`   └─ 👥 ${membersCount} membres & profils mis en cache (avatars, pseudos, rôles)`);
        } catch (error) {
            logger.error(`Erreur syncAllDiscordCache: ${error.message}`, 'CACHE');
        }
    }
}

module.exports = DiscordCacheService;
