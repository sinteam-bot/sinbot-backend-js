/**
 * src/web/controllers/channels.controller.js
 *
 * Salons Discord, messages, fils de discussion (threads) et forums.
 */

const express = require('express');
const { ChannelType } = require('discord.js');
const logger = require('../../utils/logger.js');
const { pool } = require('../../db/index.js');
const { toISOStringSafe } = require('../../utils/dateUtils.js');
const {
    validateMessageContent,
    createRateLimiters,
    requireRole,
    DISCORD_MAX_TITLE_LENGTH
} = require('../../utils/security.js');
const { getGuild, getUserAvatar } = require('./discord-helpers.js');

function createChannelsRouter(client) {
    const router = express.Router();
    const rateLimiters = createRateLimiters();

    // Middleware de validation des paramètres Discord
    router.param('channelId', (req, res, next, value) => {
        if (value.startsWith('cat-') || value.startsWith('virtual-')) return next();
        if (!/^\d{17,20}$/.test(value)) {
            return res.status(400).json({ success: false, error: `channelId invalide : "${value}"` });
        }
        next();
    });

    router.param('messageId', (req, res, next, value) => {
        if (!/^\d{17,20}$/.test(value)) {
            return res.status(400).json({ success: false, error: `messageId invalide : "${value}"` });
        }
        next();
    });

    // GET /channels
    router.get('/', async (req, res) => {
        try {
            const guild = await getGuild(client);
            const categories = [];
            const uncatChannels = [];

            let channels = null;
            if (guild && guild.channels) {
                if (typeof guild.channels.fetch === 'function') {
                    channels = await guild.channels.fetch().catch(() => guild.channels?.cache || new Map());
                } else if (guild.channels.cache) {
                    channels = guild.channels.cache;
                } else if (Array.isArray(guild.channels) || guild.channels instanceof Map) {
                    channels = guild.channels;
                }
            }

            if (channels && (channels.size > 0 || (Array.isArray(channels) && channels.length > 0))) {
                const categoriesMap = new Map();

                channels.forEach(ch => {
                    if (!ch) return;
                    if (ch.type === ChannelType.GuildCategory) {
                        categoriesMap.set(ch.id, {
                            id: ch.id,
                            name: ch.name.toUpperCase(),
                            position: ch.position,
                            isVirtual: false,
                            channels: []
                        });
                    }
                });

                channels.forEach(ch => {
                    if (!ch || ch.type === ChannelType.GuildCategory) return;

                    // Ignorer les threads et les forums
                    if (ch.isThread && ch.isThread()) return;
                    if (ch.type === ChannelType.PublicThread || ch.type === ChannelType.PrivateThread || ch.type === ChannelType.AnnouncementThread) {
                        return;
                    }
                    if (ch.type === ChannelType.GuildForum || ch.type === ChannelType.GuildMedia) {
                        return;
                    }

                    let typeStr = 'text';
                    let icon = 'hash';
                    if (ch.type === ChannelType.GuildVoice) {
                        typeStr = 'voice';
                        icon = 'volume-2';
                    } else if (ch.type === ChannelType.GuildAnnouncement) {
                        typeStr = 'announcement';
                        icon = 'megaphone';
                    }

                    const channelData = {
                        id: ch.id,
                        name: ch.name,
                        type: typeStr,
                        icon: icon,
                        topic: ch.topic || '',
                        parentId: ch.parentId,
                        position: ch.position,
                        isNsfw: ch.nsfw || false
                    };

                    if (ch.parentId && categoriesMap.has(ch.parentId)) {
                        categoriesMap.get(ch.parentId).channels.push(channelData);
                    } else {
                        uncatChannels.push(channelData);
                    }
                });

                // Trier les canaux au sein des catégories
                const sortedCategories = Array.from(categoriesMap.values())
                    .sort((a, b) => a.position - b.position)
                    .map(cat => {
                        cat.channels.sort((a, b) => a.position - b.position);
                        return cat;
                    })
                    .filter(cat => cat.channels.length > 0);

                if (uncatChannels.length > 0) {
                    uncatChannels.sort((a, b) => a.position - b.position);
                    categories.push({
                        id: 'cat-uncategorized',
                        name: 'SALONS',
                        isVirtual: false,
                        position: -1,
                        channels: uncatChannels
                    });
                }

                categories.push(...sortedCategories);
            } else {
                // Fallback BDD si Discord offline
                try {
                    const dbChannelsRes = await pool.query(`
                        SELECT * FROM discord_channels WHERE deleted_at IS NULL ORDER BY position ASC
                    `);
                    const dbChannels = dbChannelsRes.rows;
                    const catMap = new Map();
                    const uncat = [];

                    dbChannels.forEach(ch => {
                        if (ch.type === 'GuildCategory') {
                            catMap.set(ch.channel_id, {
                                id: ch.channel_id,
                                name: ch.name.toUpperCase(),
                                position: ch.position,
                                isVirtual: false,
                                channels: []
                            });
                        }
                    });

                    dbChannels.forEach(ch => {
                        if (ch.type === 'GuildCategory') return;
                        const typeLower = (ch.type || '').toLowerCase();
                        if (typeLower.includes('forum') || typeLower.includes('thread') || typeLower.includes('media')) return;

                        const channelData = {
                            id: ch.channel_id,
                            name: ch.name,
                            type: typeLower.includes('voice') ? 'voice' : 'text',
                            icon: typeLower.includes('voice') ? 'volume-2' : 'hash',
                            topic: ch.topic || '',
                            parentId: ch.parent_id,
                            position: ch.position,
                            isNsfw: !!ch.is_nsfw
                        };

                        if (ch.parent_id && catMap.has(ch.parent_id)) {
                            catMap.get(ch.parent_id).channels.push(channelData);
                        } else {
                            uncat.push(channelData);
                        }
                    });

                    if (uncat.length > 0) {
                        categories.push({
                            id: 'cat-uncategorized',
                            name: 'SALONS',
                            isVirtual: false,
                            position: -1,
                            channels: uncat
                        });
                    }
                    categories.push(...Array.from(catMap.values()).filter(cat => cat.channels.length > 0));
                } catch {
                    // Ignorer erreur BDD
                }
            }

            const allFlatChannels = categories.flatMap(c => c.channels || []);
            res.json({
                success: true,
                data: categories,
                categories: categories,
                channels: allFlatChannels
            });
        } catch (error) {
            logger.error(`Erreur GET /api/channels: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /channels/:channelId/messages
    router.get('/:channelId/messages', async (req, res) => {
        const { channelId } = req.params;
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
        const { before, after } = req.query;

        // Salons virtuels
        if (channelId.startsWith('virtual-')) {
            return res.json({
                success: true,
                data: {
                    channelId,
                    isVirtual: true,
                    messages: [],
                    hasMore: false
                }
            });
        }

        try {
            let messagesList = [];
            let hasMore = false;
            let channelObj = null;

            if (client && (typeof client.isReady !== 'function' || client.isReady())) {
                try {
                    channelObj = await client.channels.fetch(channelId).catch(() => null);
                } catch {
                    channelObj = null;
                }
            }

            if (channelObj && channelObj.isTextBased && channelObj.isTextBased()) {
                const fetchOptions = { limit };
                if (before) fetchOptions.before = before;
                if (after) fetchOptions.after = after;

                const fetched = await channelObj.messages.fetch(fetchOptions);
                hasMore = fetched.size >= limit;

                messagesList = Array.from(fetched.values()).map(msg => {
                    const member = msg.member;
                    let roleColor = null;
                    if (member && member.displayColor && member.displayColor !== 0) {
                        roleColor = `#${member.displayColor.toString(16).padStart(6, '0')}`;
                    }

                    return {
                        id: msg.id,
                        channelId: msg.channelId,
                        author: {
                            id: msg.author.id,
                            username: msg.author.username,
                            globalName: msg.author.globalName || msg.author.username,
                            displayName: member?.displayName || msg.author.globalName || msg.author.username,
                            avatar: getUserAvatar(msg.author, member),
                            bot: msg.author.bot,
                            roleColor: roleColor
                        },
                        content: msg.content || '',
                        createdAt: toISOStringSafe(msg.createdAt, new Date().toISOString()),
                        pinned: msg.pinned,
                        editedAt: toISOStringSafe(msg.editedAt, null),
                        attachments: Array.from(msg.attachments.values()).map(att => ({
                            id: att.id,
                            name: att.name,
                            url: att.url,
                            proxyUrl: att.proxyURL,
                            contentType: att.contentType,
                            size: att.size,
                            width: att.width,
                            height: att.height
                        })),
                        embeds: msg.embeds.map(emb => ({
                            title: emb.title,
                            description: emb.description,
                            url: emb.url,
                            color: emb.hexColor || (emb.color ? `#${emb.color.toString(16).padStart(6, '0')}` : null),
                            author: emb.author ? {
                                name: emb.author.name,
                                url: emb.author.url,
                                iconURL: emb.author.iconURL
                            } : null,
                            fields: emb.fields || [],
                            thumbnail: emb.thumbnail ? { url: emb.thumbnail.url } : null,
                            image: emb.image ? { url: emb.image.url } : null,
                            footer: emb.footer ? { text: emb.footer.text, iconURL: emb.footer.iconURL } : null,
                            timestamp: emb.timestamp
                        })),
                        reactions: Array.from(msg.reactions.cache.values()).map(r => {
                            const isCustom = !!r.emoji.id;
                            const isAnimated = !!r.emoji.animated;
                            const url = isCustom
                                ? (r.emoji.imageURL ? r.emoji.imageURL({ extension: isAnimated ? 'gif' : 'png', size: 64 }) : `https://cdn.discordapp.com/emojis/${r.emoji.id}.${isAnimated ? 'gif' : 'png'}?size=64&quality=lossless`)
                                : null;
                            return {
                                emoji: r.emoji.name,
                                id: r.emoji.id || null,
                                animated: isAnimated,
                                count: r.count,
                                url: url
                            };
                        }),
                        thread: (msg.thread || msg.hasThread) ? {
                            id: msg.thread?.id || null,
                            name: msg.thread?.name || 'Fil de discussion',
                            messageCount: msg.thread?.messageCount || 0,
                            memberCount: msg.thread?.memberCount || 0,
                            archived: !!msg.thread?.archived
                        } : null
                    };
                });

                // Trier par date croissante
                messagesList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            } else {
                if (channelId.startsWith('cat-') || channelId.startsWith('virtual-')) {
                    messagesList = [];
                    hasMore = false;
                } else {
                    // Fallback BDD
                    let sql = `
                        SELECT m.*, u.global_name, u.avatar_url, u.bot
                        FROM discord_messages m
                        LEFT JOIN discord_users u ON m.author_id = u.user_id
                        WHERE m.channel_id = $1
                    `;
                    const params = [channelId];

                    if (before) {
                        params.push(before);
                        sql += ` AND m.created_at < (SELECT created_at FROM discord_messages WHERE message_id = $${params.length})`;
                    }

                    params.push(limit);
                    sql += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;

                    const dbRes = await pool.query(sql, params);
                    hasMore = dbRes.rows.length >= limit;

                    messagesList = dbRes.rows.map(row => {
                        let embeds = [];
                        let attachments = [];
                        let reactions = [];
                        try { embeds = JSON.parse(row.embeds_json || '[]'); } catch (e) { logger.debug(`Erreur parse embeds_json pour msg ${row.message_id}: ${e.message}`, 'API'); }
                        try { attachments = JSON.parse(row.attachments_json || '[]'); } catch (e) { logger.debug(`Erreur parse attachments_json pour msg ${row.message_id}: ${e.message}`, 'API'); }
                        try { reactions = JSON.parse(row.reactions_json || '[]'); } catch (e) { logger.debug(`Erreur parse reactions_json pour msg ${row.message_id}: ${e.message}`, 'API'); }

                        return {
                            id: row.message_id,
                            channelId: row.channel_id,
                            author: {
                                id: row.author_id,
                                username: row.author_username,
                                globalName: row.global_name || row.author_username,
                                displayName: row.global_name || row.author_username,
                                avatar: row.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png',
                                bot: !!row.bot,
                                roleColor: null
                            },
                            content: row.content || '',
                            createdAt: row.created_at,
                            pinned: !!row.pinned,
                            attachments,
                            embeds,
                            reactions,
                            thread: null
                        };
                    });
                    messagesList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                }
            }

            const isThread = channelObj ? (channelObj.isThread ? channelObj.isThread() : false) : false;
            const parentChannel = (isThread && channelObj.parent) ? {
                id: channelObj.parent.id,
                name: channelObj.parent.name
            } : null;
            const threadInfo = isThread ? {
                id: channelObj.id,
                name: channelObj.name,
                archived: !!channelObj.archived,
                locked: !!channelObj.locked,
                messageCount: channelObj.messageCount || 0,
                memberCount: channelObj.memberCount || 0
            } : null;

            res.json({
                success: true,
                data: {
                    channelId,
                    channelName: channelObj?.name || null,
                    isThread,
                    parentChannel,
                    threadInfo,
                    messages: messagesList,
                    hasMore: hasMore,
                    oldestId: messagesList.length > 0 ? messagesList[0].id : null,
                    newestId: messagesList.length > 0 ? messagesList[messagesList.length - 1].id : null
                }
            });
        } catch (error) {
            logger.error(`Erreur messages salon ${channelId}: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /channels/:channelId/messages
    router.post('/:channelId/messages', rateLimiters.write, requireRole(['admin', 'mod']), async (req, res) => {
        const { channelId } = req.params;
        const { content } = req.body;

        const contentCheck = validateMessageContent(content);
        if (!contentCheck.valid) {
            return res.status(400).json({ success: false, error: contentCheck.reason });
        }

        try {
            if (!client || (typeof client.isReady === 'function' && !client.isReady())) {
                return res.status(503).json({ success: false, error: 'Bot Discord non connecté' });
            }

            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                return res.status(404).json({ success: false, error: 'Salon introuvable ou non textuel' });
            }

            if (channel.isThread && channel.isThread() && channel.archived) {
                await channel.setArchived(false).catch(err => {
                    logger.warn(`Impossible de désarchiver le fil ${channel.id}: ${err.message}`, 'API');
                });
            }

            const sentMessage = await channel.send(content.trim());
            logger.info(`Message envoyé sur ${channel.isThread?.() ? 'le fil' : '#'}${channel.name} par interface Web`, 'WEB');

            res.json({
                success: true,
                data: {
                    id: sentMessage.id,
                    content: sentMessage.content,
                    createdAt: toISOStringSafe(sentMessage.createdAt, new Date().toISOString())
                }
            });
        } catch (error) {
            logger.error(`Erreur envoi message sur ${channelId}: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /channels/:channelId/threads
    router.get('/:channelId/threads', async (req, res) => {
        const { channelId } = req.params;
        try {
            if (!client || (typeof client.isReady === 'function' && !client.isReady())) return res.json({ success: true, data: [] });
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.threads) return res.json({ success: true, data: [] });

            const active = await channel.threads.fetchActive().catch(() => ({ threads: new Map() }));
            const archived = await channel.threads.fetchArchived().catch(() => ({ threads: new Map() }));

            const threads = [...active.threads.values(), ...archived.threads.values()].map(th => ({
                id: th.id,
                name: th.name,
                type: 'thread',
                icon: 'git-commit',
                parentId: th.parentId,
                messageCount: th.messageCount || 0,
                memberCount: th.memberCount || 0,
                archived: !!th.archived,
                locked: !!th.locked
            }));

            res.json({ success: true, data: threads });
        } catch (error) {
            logger.error(`Erreur threads salon ${channelId}: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /channels/:channelId/posts
    router.get('/:channelId/posts', async (req, res) => {
        const { channelId } = req.params;
        try {
            if (!client || (typeof client.isReady === 'function' && !client.isReady())) {
                return res.json({ success: true, data: { channelId, posts: [], availableTags: [] } });
            }

            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) return res.status(404).json({ success: false, error: 'Salon forum introuvable' });

            const availableTags = channel.availableTags ? channel.availableTags.map(t => ({
                id: t.id,
                name: t.name,
                emoji: t.emoji ? (t.emoji.name || (t.emoji.id ? `https://cdn.discordapp.com/emojis/${t.emoji.id}.png?size=48&quality=lossless` : null)) : null,
                moderated: !!t.moderated
            })) : [];

            let allThreads = [];
            if (channel.threads) {
                const active = await channel.threads.fetchActive().catch(() => ({ threads: new Map() }));
                const archived = await channel.threads.fetchArchived().catch(() => ({ threads: new Map() }));
                allThreads = [...active.threads.values(), ...archived.threads.values()];
            }

            const posts = await Promise.all(allThreads.map(async (th) => {
                let starterContent = '';
                try {
                    const starter = await th.fetchStarterMessage().catch(err => {
                        logger.debug(`Starter message non accessible pour fil ${th.id}: ${err.message}`, 'API');
                        return null;
                    });
                    if (starter) starterContent = starter.content || '';
                } catch (e) {
                    logger.debug(`Erreur fetchStarterMessage fil ${th.id}: ${e.message}`, 'API');
                }

                let owner = { id: th.ownerId, username: 'Membre', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' };
                if (th.ownerId && th.guild) {
                    const member = th.guild.members.cache.get(th.ownerId);
                    if (member) {
                        owner = {
                            id: member.id,
                            username: member.user.username,
                            displayName: member.displayName,
                            avatar: getUserAvatar(member.user, member)
                        };
                    }
                }

                return {
                    id: th.id,
                    name: th.name,
                    parentId: th.parentId,
                    ownerId: th.ownerId,
                    owner,
                    appliedTags: th.appliedTags || [],
                    messageCount: th.messageCount || 0,
                    memberCount: th.memberCount || 0,
                    archived: !!th.archived,
                    locked: !!th.locked,
                    createdAt: toISOStringSafe(th.createdAt, null),
                    lastMessageId: th.lastMessageId,
                    preview: starterContent
                };
            }));

            posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

            res.json({
                success: true,
                data: {
                    channelId: channel.id,
                    channelName: channel.name,
                    topic: channel.topic || '',
                    availableTags,
                    posts
                }
            });
        } catch (error) {
            logger.error(`Erreur posts forum ${channelId}: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /channels/:channelId/posts
    router.post('/:channelId/posts', rateLimiters.write, requireRole(['admin', 'mod']), async (req, res) => {
        const { channelId } = req.params;
        const { title, content, appliedTags } = req.body;

        if (!title || typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ success: false, error: 'Titre requis' });
        }
        if (title.trim().length > DISCORD_MAX_TITLE_LENGTH) {
            return res.status(400).json({ success: false, error: `Le titre dépasse ${DISCORD_MAX_TITLE_LENGTH} caractères` });
        }

        const contentCheck = validateMessageContent(content);
        if (!contentCheck.valid) {
            return res.status(400).json({ success: false, error: contentCheck.reason });
        }

        try {
            if (!client || (typeof client.isReady === 'function' && !client.isReady())) {
                return res.status(503).json({ success: false, error: 'Bot Discord non connecté' });
            }

            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel || channel.type !== ChannelType.GuildForum) {
                return res.status(400).json({ success: false, error: 'Salon forum introuvable' });
            }

            const createdPost = await channel.threads.create({
                name: title.trim(),
                message: { content: content.trim() },
                appliedTags: Array.isArray(appliedTags) ? appliedTags : []
            });

            logger.info(`Nouveau post créé dans le forum #${channel.name}: "${title}"`, 'WEB');

            res.json({
                success: true,
                data: {
                    id: createdPost.id,
                    name: createdPost.name,
                    parentId: createdPost.parentId
                }
            });
        } catch (error) {
            logger.error(`Erreur création post forum ${channelId}: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // PATCH /channels/:channelId/messages/:messageId
    router.patch('/:channelId/messages/:messageId', rateLimiters.write, requireRole(['admin', 'mod']), async (req, res) => {
        const { channelId, messageId } = req.params;
        const { content } = req.body;

        const contentCheck = validateMessageContent(content);
        if (!contentCheck.valid) {
            return res.status(400).json({ success: false, error: contentCheck.reason });
        }

        try {
            let editedContent = content.trim();
            let editedAt = new Date().toISOString();

            if (client && (typeof client.isReady !== 'function' || client.isReady())) {
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel || !channel.isTextBased()) {
                    return res.status(404).json({ success: false, error: 'Salon introuvable' });
                }

                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) {
                    return res.status(404).json({ success: false, error: 'Message introuvable sur Discord' });
                }

                if (message.author.id !== client.user?.id) {
                    return res.status(403).json({
                        success: false,
                        error: 'Discord n\'autorise que la modification des messages envoyés par le bot lui-même.'
                    });
                }

                const editedMessage = await message.edit(editedContent);
                editedAt = toISOStringSafe(editedMessage.editedAt, new Date().toISOString());
                logger.info(`Message ${messageId} modifié sur #${channel.name} par interface Web`, 'WEB');
            }

            try {
                await pool.query(
                    'UPDATE discord_messages SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE message_id = $2',
                    [editedContent, messageId]
                );
            } catch (e) {
                logger.warn(`Échec mise à jour BDD message ${messageId}: ${e.message}`, 'WEB');
            }

            res.json({
                success: true,
                data: {
                    id: messageId,
                    channelId,
                    content: editedContent,
                    editedAt: editedAt
                }
            });
        } catch (error) {
            logger.error(`Erreur modification message ${messageId}: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // DELETE /channels/:channelId/messages/:messageId
    router.delete('/:channelId/messages/:messageId', rateLimiters.write, requireRole(['admin', 'mod']), async (req, res) => {
        const { channelId, messageId } = req.params;

        try {
            if (client && (typeof client.isReady !== 'function' || client.isReady())) {
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel || !channel.isTextBased()) {
                    return res.status(404).json({ success: false, error: 'Salon introuvable' });
                }

                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) {
                    return res.status(404).json({ success: false, error: 'Message introuvable sur Discord' });
                }

                await message.delete();
                logger.info(`Message ${messageId} supprimé sur #${channel.name} par interface Web`, 'WEB');
            }

            try {
                await pool.query('DELETE FROM discord_messages WHERE message_id = $1', [messageId]);
            } catch (e) {
                logger.warn(`Échec suppression BDD message ${messageId}: ${e.message}`, 'WEB');
            }

            res.json({
                success: true,
                message: 'Message supprimé avec succès',
                data: { id: messageId, channelId }
            });
        } catch (error) {
            logger.error(`Erreur suppression message ${messageId}: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createChannelsRouter;
