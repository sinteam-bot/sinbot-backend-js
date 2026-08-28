const express = require('express');
const path = require('path');
const fs = require('fs');
const { ChannelType } = require('discord.js');
const logger = require("../utils/logger.js");
const db = require("../db/legacy-bridge.js").legacy;
const { toISOStringSafe } = require("../utils/dateUtils.js");
const { config, getConfig, saveModuleConfig } = require("../config/index.js");
const { imageProxyService } = require("../services/imageProxyService.js");
const {
    validateDiscordParamsMiddleware,
    validateMessageContent,
    validateEmbed,
    createRateLimiters,
    requireRole,
    DISCORD_MAX_MESSAGE_LENGTH,
    DISCORD_MAX_TITLE_LENGTH
} = require('../utils/security.js');

function createWebRouter(client) {
    const router = express.Router();
    const rateLimiters = createRateLimiters();
    let _lastMembersFetch = 0;

    // Middleware de validation des paramètres Discord (:channelId, :messageId, :userId)
    router.param('channelId', (req, res, next, value) => {
        // Accepter les salons virtuels du dashboard (cat-*, virtual-*)
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
    router.param('userId', (req, res, next, value) => {
        if (!/^\d{17,20}$/.test(value)) {
            return res.status(400).json({ success: false, error: `userId invalide : "${value}"` });
        }
        next();
    });

    // ============================================
    // 0. PROXY & CACHE D'IMAGES / ASSETS DISCORD
    // ============================================
    router.get('/proxy/image', (req, res) => imageProxyService.handleRequest(req, res));

    router.get('/proxy/avatar/:userId', async (req, res) => {
        const { userId } = req.params;
        try {
            const guild = await getGuild();
            const member = guild ? (await guild.members.fetch(userId).catch(() => guild.members.cache.get(userId))) : null;
            const user = member?.user || (client?.users ? (await client.users.fetch(userId).catch(() => client.users.cache.get(userId))) : null);
            const avatarUrl = getUserAvatar(user || { id: userId }, member);
            req.query.url = avatarUrl;
            return imageProxyService.handleRequest(req, res);
        } catch {
            const defaultIndex = (Number(userId) || 0) % 5;
            req.query.url = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
            return imageProxyService.handleRequest(req, res);
        }
    });

    router.get('/proxy/emoji/:emojiId', (req, res) => {
        const { emojiId } = req.params;
        const isAnimated = req.query.animated === 'true' || req.query.animated === '1';
        const ext = isAnimated ? 'gif' : 'png';
        req.query.url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=64&quality=lossless`;
        return imageProxyService.handleRequest(req, res);
    });

    // Helper: récupérer le serveur principal Discord
    async function getGuild() {
        if (!client || !client.isReady()) return null;
        const guildId = process.env.GUILD_ID;
        if (guildId) {
            try {
                return await client.guilds.fetch(guildId).catch(() => client.guilds.cache.get(guildId));
            } catch (e) {
                return client.guilds.cache.get(guildId) || client.guilds.cache.first() || null;
            }
        }
        return client.guilds.cache.first() || null;
    }

    // Helper pour formater un avatar Discord
    function getUserAvatar(user, member = null) {
        if (member && member.avatar) {
            return `https://cdn.discordapp.com/guilds/${member.guild.id}/users/${user.id}/avatars/${member.avatar}.png?size=128`;
        }
        if (user && user.avatar) {
            return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
        }
        const defaultIndex = user ? (Number(user.id) % 5) : 0;
        return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    }

    // ============================================
    // 1. INFORMATIONS DU SERVEUR / STATUT BOT
    // ============================================
    router.get('/guild', async (req, res) => {
        try {
            const guild = await getGuild();
            const botUser = client?.user;

            const guildEmojis = guild ? Array.from(guild.emojis.cache.values()).map(e => ({
                id: e.id,
                name: e.name,
                animated: !!e.animated,
                url: e.imageURL ? e.imageURL({ extension: e.animated ? 'gif' : 'png', size: 64 }) : `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=64&quality=lossless`
            })) : [];

            let guildInfo = {
                id: guild?.id || process.env.GUILD_ID || 'server-demo',
                name: guild?.name || 'Serveur Discord',
                icon: guild?.icon ? guild.iconURL({ dynamic: true, size: 256 }) : null,
                memberCount: guild?.memberCount || 0,
                botOnline: client?.isReady() || false,
                emojis: guildEmojis,
                bot: {
                    id: botUser?.id || null,
                    username: botUser?.username || 'Bot',
                    tag: botUser?.tag || 'Bot#0001',
                    avatar: botUser ? getUserAvatar(botUser) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                    avatarUrl: botUser ? getUserAvatar(botUser) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                    status: client?.isReady() ? 'online' : 'offline',
                    customStatus: client?.isReady() ? 'En ligne' : 'Déconnecté',
                    ping: (client?.ws?.ping !== undefined && client.ws.ping >= 0) ? Math.round(client.ws.ping) : 24,
                    uptime: Math.floor(process.uptime())
                }
            };

            res.json({ success: true, data: guildInfo, bot: guildInfo.bot });
        } catch (error) {
            logger.error(`Erreur GET /api/guild: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/emojis', async (req, res) => {
        try {
            const guild = await getGuild();
            let emojis = [];

            if (guild && guild.emojis) {
                emojis = Array.from(guild.emojis.cache.values()).map(e => ({
                    id: e.id,
                    name: e.name,
                    animated: !!e.animated,
                    url: e.imageURL ? e.imageURL({ extension: e.animated ? 'gif' : 'png', size: 64 }) : `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=64&quality=lossless`
                }));
            }

            // Fallback vers le cache BDD si bot non connecté ou emojis vides
            if (emojis.length === 0) {
                try {
                    const dbRes = await db.pool.query('SELECT emoji_id, name, animated, url FROM discord_emojis WHERE deleted_at IS NULL ORDER BY name ASC');
                    emojis = dbRes.rows.map(r => ({
                        id: r.emoji_id,
                        name: r.name,
                        animated: r.animated === 1,
                        url: r.url
                    }));
                } catch (e) {
                    logger.warn(`Échec fallback BDD pour les emojis: ${e.message}`, 'API');
                }
            }

            res.json({ success: true, data: emojis });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Endpoint pour forcer une resynchronisation complète du cache BDD
    router.post('/cache/sync', rateLimiters.sensitive, requireRole('admin'), async (req, res) => {
        try {
            const guild = await getGuild();
            if (!guild) {
                return res.status(400).json({ success: false, error: 'Serveur Discord inaccessible pour la synchronisation' });
            }
            const DiscordCacheService = require('../services/discordCacheService.js');
            await DiscordCacheService.syncAllDiscordCache(guild);
            res.json({ success: true, message: 'Cache Discord synchronisé avec succès en base de données.' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 2. LISTE DES SALONS
    // ============================================
    router.get('/channels', async (req, res) => {
        try {
            const guild = await getGuild();
            const categories = [];
            const uncatChannels = [];

            if (guild) {
                const channels = await guild.channels.fetch().catch(() => guild.channels.cache);

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
                    const dbChannelsRes = await db.pool.query(`
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
                } catch (e) {
                    // Si aucune BDD, on garde au moins la catégorie virtuelle
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

    // ============================================
    // 3. MESSAGES D'UN SALON (PAGINATION / DÉFILEMENT INFINI)
    // ============================================
    router.get('/channels/:channelId/messages', async (req, res) => {
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

            if (client && client.isReady()) {
                try {
                    channelObj = await client.channels.fetch(channelId).catch(() => null);
                } catch (e) {
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

                // Trier par date croissante (du plus ancien au plus récent)
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

                    const dbRes = await db.pool.query(sql, params);
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

    // ============================================
    // 4. ENVOYER UN MESSAGE DEPUIS LE WEB (EN TANT QUE BOT)
    // ============================================
    router.post('/channels/:channelId/messages', rateLimiters.write, requireRole(['admin', 'mod']), async (req, res) => {
        const { channelId } = req.params;
        const { content } = req.body;

        // Validation du contenu du message
        const contentCheck = validateMessageContent(content);
        if (!contentCheck.valid) {
            return res.status(400).json({ success: false, error: contentCheck.reason });
        }

        try {
            if (!client || !client.isReady()) {
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

    // ============================================
    // 4a. LISTE DES FILS DE DISCUSSION (THREADS) D'UN SALON
    // ============================================
    router.get('/channels/:channelId/threads', async (req, res) => {
        const { channelId } = req.params;
        try {
            if (!client || !client.isReady()) return res.json({ success: true, data: [] });
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

    // ============================================
    // 4a-2. POSTS D'UN FORUM (LISTE DÉTAILLÉE AVEC TAGS & APERÇUS)
    // ============================================
    router.get('/channels/:channelId/posts', async (req, res) => {
        const { channelId } = req.params;
        try {
            if (!client || !client.isReady()) {
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

    router.post('/channels/:channelId/posts', rateLimiters.write, requireRole(['admin', 'mod']), async (req, res) => {
        const { channelId } = req.params;
        const { title, content, appliedTags } = req.body;

        // Validation du titre
        if (!title || typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ success: false, error: 'Titre requis' });
        }
        if (title.trim().length > DISCORD_MAX_TITLE_LENGTH) {
            return res.status(400).json({ success: false, error: `Le titre dépasse ${DISCORD_MAX_TITLE_LENGTH} caractères` });
        }

        // Validation du contenu
        const contentCheck = validateMessageContent(content);
        if (!contentCheck.valid) {
            return res.status(400).json({ success: false, error: contentCheck.reason });
        }

        try {
            if (!client || !client.isReady()) {
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

    // ============================================
    // 4b. MODIFIER UN MESSAGE DEPUIS LE WEB
    // ============================================
    router.patch('/channels/:channelId/messages/:messageId', rateLimiters.write, requireRole(['admin', 'mod']), async (req, res) => {
        const { channelId, messageId } = req.params;
        const { content } = req.body;

        // Validation du contenu du message
        const contentCheck = validateMessageContent(content);
        if (!contentCheck.valid) {
            return res.status(400).json({ success: false, error: contentCheck.reason });
        }

        try {
            let editedContent = content.trim();
            let editedAt = new Date().toISOString();

            if (client && client.isReady()) {
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel || !channel.isTextBased()) {
                    return res.status(404).json({ success: false, error: 'Salon introuvable' });
                }

                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) {
                    return res.status(404).json({ success: false, error: 'Message introuvable sur Discord' });
                }

                // Vérifier si le message appartient au bot (Discord n'autorise pas la modification des messages d'autrui)
                if (message.author.id !== client.user.id) {
                    return res.status(403).json({
                        success: false,
                        error: 'Discord n\'autorise que la modification des messages envoyés par le bot lui-même.'
                    });
                }

                const editedMessage = await message.edit(editedContent);
                editedAt = toISOStringSafe(editedMessage.editedAt, new Date().toISOString());
                logger.info(`Message ${messageId} modifié sur #${channel.name} par interface Web`, 'WEB');
            }

            // Mettre à jour dans la base de données si présent
            try {
                await db.pool.query(
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

    // ============================================
    // 4c. SUPPRIMER UN MESSAGE DEPUIS LE WEB
    // ============================================
    router.delete('/channels/:channelId/messages/:messageId', rateLimiters.write, requireRole(['admin', 'mod']), async (req, res) => {
        const { channelId, messageId } = req.params;

        try {
            if (client && client.isReady()) {
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

            // Supprimer de la base de données si présent
            try {
                await db.pool.query(
                    'DELETE FROM discord_messages WHERE message_id = $1',
                    [messageId]
                );
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

    // Logs système/console (Winston / File Logger)
    router.get('/logs/system', (req, res) => {
        try {
            const { level, category, search, limit, since } = req.query;
            const logs = logger.getLogs({ level, category, search, limit, since });
            res.json({
                success: true,
                data: logs,
                total: logs.length
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/logs', (req, res, next) => {
        // Si les paramètres demandent spécifiquement les logs applicatifs/console
        if (req.query.level !== undefined || req.query.category !== undefined || req.query.since !== undefined || req.query.system === 'true') {
            try {
                const { level, category, search, limit, since } = req.query;
                const logs = logger.getLogs({ level, category, search, limit, since });
                return res.json({
                    success: true,
                    data: logs,
                    total: logs.length
                });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }
        }
        // Sinon déléguer au LogsController de Phase 4 (Audit logs en BDD)
        next();
    });

    // Server-Sent Events (SSE) pour le flux de logs en direct
    router.get('/logs/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const sendEvent = (event, data) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        // Envoyer un message de bienvenue et les 50 derniers logs
        sendEvent('connected', { timestamp: new Date().toISOString() });
        const recent = logger.getLogs({ limit: 50 });
        recent.forEach(log => sendEvent('log', log));

        // Écouteur pour les nouveaux logs
        const onNewLog = (log) => {
            sendEvent('log', log);
        };

        const onClear = () => {
            sendEvent('clear', {});
        };

        logger.on('log', onNewLog);
        logger.on('clear', onClear);

        // Heartbeat pour maintenir la connexion active
        const heartbeat = setInterval(() => {
            sendEvent('ping', { time: Date.now() });
        }, 15000);

        req.on('close', () => {
            clearInterval(heartbeat);
            logger.off('log', onNewLog);
            logger.off('clear', onClear);
        });
    });

    // Vider les logs
    router.delete('/logs', (req, res) => {
        logger.clear();
        res.json({ success: true, message: 'Logs effacés' });
    });

    // ============================================
    // 6. SALON VIRTUEL : USERS (LISTE, RECHERCHE, RÔLES)
    // ============================================
    router.get('/users', async (req, res) => {
        try {
            const guild = await getGuild();
            const { search, role, isBot, hasXp, sortBy = 'joined', order = 'desc', page = 1, limit = 500 } = req.query;

            let membersList = [];

            if (guild) {
                // Ne solliciter la passerelle Discord (Opcode 8) que si le cache local est vide ou après 5 minutes
                const now = Date.now();
                if (guild.members.cache.size === 0 || req.query.force_fetch === 'true' || (now - _lastMembersFetch > 5 * 60 * 1000)) {
                    try {
                        await guild.members.fetch();
                        _lastMembersFetch = now;
                    } catch (e) {
                        // Si rate-limit Opcode 8 de Discord, utiliser le cache existant sans spammer
                        if (!e.message?.includes('opcode 8') && guild.members.cache.size === 0) {
                            logger.warn(`Échec fetch guild.members: ${e.message}`, 'API');
                        }
                    }
                }

                const members = guild.members.cache;
                members.forEach(member => {
                    const highestRole = member.roles.highest;
                    const roleColor = (member.displayColor && member.displayColor !== 0)
                        ? `#${member.displayColor.toString(16).padStart(6, '0')}`
                        : null;

                    const roles = member.roles.cache
                        .filter(r => r.id !== guild.id)
                        .map(r => ({
                            id: r.id,
                            name: r.name,
                            color: (r.color && r.color !== 0) ? `#${r.color.toString(16).padStart(6, '0')}` : null,
                            rawColor: r.color || 0,
                            position: r.position,
                            icon: r.iconURL ? r.iconURL({ size: 64 }) : null,
                            unicodeEmoji: r.unicodeEmoji || null,
                            hoist: r.hoist
                        }))
                        .sort((a, b) => b.position - a.position);

                    const avatarUrl = getUserAvatar(member.user, member);

                    membersList.push({
                        id: member.id,
                        username: member.user.username,
                        globalName: member.user.globalName || member.user.username,
                        displayName: member.displayName,
                        discriminator: member.user.discriminator,
                        tag: member.user.tag,
                        avatar: avatarUrl,
                        avatarUrl: avatarUrl,
                        displayColor: roleColor,
                        isBot: member.user.bot,
                        joinedAt: toISOStringSafe(member.joinedAt, null),
                        createdAt: toISOStringSafe(member.user?.createdAt, null),
                        highestRole: highestRole ? {
                            id: highestRole.id,
                            name: highestRole.name,
                            color: roleColor,
                            position: highestRole.position,
                            icon: highestRole.iconURL ? highestRole.iconURL({ size: 64 }) : null,
                            unicodeEmoji: highestRole.unicodeEmoji || null
                        } : null,
                        roles: roles,
                        presence: member.presence ? member.presence.status : 'offline'
                    });
                });
            } else {
                // Fallback BDD PostgreSQL / SQLite
                const dbRes = await db.pool.query(`
                    SELECT sm.*, ux.xp, ux.level, ux.messages_count, ux.voice_minutes
                    FROM server_members sm
                    LEFT JOIN user_xp ux ON sm.user_id = ux.user_id
                    WHERE sm.deleted_at IS NULL AND sm.left_at IS NULL
                `);

                membersList = dbRes.rows.map(row => {
                    let roles = [];
                    try { roles = JSON.parse(row.roles || '[]'); } catch (e) { logger.debug(`Erreur parse roles pour membre ${row.user_id}: ${e.message}`, 'API'); }
                    const avatar = row.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const highestRole = row.highest_role_id ? {
                        id: row.highest_role_id,
                        name: row.highest_role_name,
                        color: row.highest_role_color
                    } : null;

                    return {
                        id: row.user_id,
                        username: row.username,
                        globalName: row.display_name || row.username,
                        displayName: row.display_name || row.username,
                        discriminator: row.discriminator || '0000',
                        tag: row.tag || `${row.username}#${row.discriminator || '0000'}`,
                        avatar: avatar,
                        avatarUrl: avatar,
                        displayColor: row.display_color || row.highest_role_color || null,
                        highestRole: highestRole,
                        presence: row.presence || 'offline',
                        isBot: !!row.is_bot,
                        joinedAt: row.joined_at,
                        createdAt: row.account_created_at,
                        roles: Array.isArray(roles) ? roles.map(r => typeof r === 'string' ? { id: r, name: r, color: '#5865F2' } : r) : [],
                        xp: row.xp || 0,
                        level: row.level || 1,
                        messagesCount: row.messages_count || 0,
                        voiceMinutes: row.voice_minutes || 0
                    };
                });
            }

            // Récupérer les stats XP pour compléter les membres si possible
            try {
                const xpStats = await db.pool.query('SELECT user_id, xp, level, messages_count, voice_minutes FROM user_xp');
                const xpMap = new Map();
                xpStats.rows.forEach(x => xpMap.set(x.user_id, x));

                membersList.forEach(m => {
                    const xpData = xpMap.get(m.id);
                    if (xpData) {
                        m.xp = xpData.xp;
                        m.level = xpData.level;
                        m.messagesCount = xpData.messages_count;
                        m.voiceMinutes = xpData.voice_minutes;
                    } else {
                        m.xp = m.xp || 0;
                        m.level = m.level || 1;
                        m.messagesCount = m.messagesCount || 0;
                        m.voiceMinutes = m.voiceMinutes || 0;
                    }
                });
            } catch (e) {
                logger.warn(`Impossible de récupérer user_xp pour les utilisateurs: ${e.message}`, 'API');
            }

            // Filtrage par texte de recherche
            if (search) {
                const query = search.toLowerCase();
                membersList = membersList.filter(m =>
                    m.username.toLowerCase().includes(query) ||
                    m.displayName.toLowerCase().includes(query) ||
                    m.id.includes(query)
                );
            }

            // Filtrage par Rôle
            if (role && role !== 'ALL') {
                membersList = membersList.filter(m =>
                    m.roles.some(r => r.id === role || r.name.toLowerCase() === role.toLowerCase())
                );
            }

            // Filtrage Bots vs Humains
            if (isBot === 'true') {
                membersList = membersList.filter(m => m.isBot);
            } else if (isBot === 'false') {
                membersList = membersList.filter(m => !m.isBot);
            }

            // Filtrage XP
            if (hasXp === 'has_xp') {
                membersList = membersList.filter(m => (m.xp || 0) > 0);
            } else if (hasXp === 'no_xp') {
                membersList = membersList.filter(m => (m.xp || 0) === 0);
            }

            // Tri
            membersList.sort((a, b) => {
                let diff = 0;
                if (sortBy === 'name') {
                    diff = a.displayName.localeCompare(b.displayName);
                } else if (sortBy === 'xp') {
                    diff = (a.xp || 0) - (b.xp || 0);
                } else if (sortBy === 'level') {
                    diff = (a.level || 1) - (b.level || 1);
                } else if (sortBy === 'messages') {
                    diff = (a.messagesCount || 0) - (b.messagesCount || 0);
                } else if (sortBy === 'voice') {
                    diff = (a.voiceMinutes || 0) - (b.voiceMinutes || 0);
                } else if (sortBy === 'created') {
                    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    diff = dateA - dateB;
                } else if (sortBy === 'type') {
                    diff = (a.isBot ? 1 : 0) - (b.isBot ? 1 : 0);
                } else {
                    // Par date d'arrivée
                    const dateA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
                    const dateB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
                    diff = dateA - dateB;
                }
                return order === 'asc' ? diff : -diff;
            });

            const total = membersList.length;
            const p = Math.max(parseInt(page) || 1, 1);
            const l = Math.min(Math.max(parseInt(limit) || 200, 1), 1000);
            const paginated = membersList.slice((p - 1) * l, p * l);

            res.json({
                success: true,
                data: paginated,
                users: paginated,
                total,
                page: p,
                limit: l,
                totalPages: Math.ceil(total / l)
            });
        } catch (error) {
            logger.error(`Erreur GET /api/users: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Récupérer la liste des rôles du serveur
    router.get('/roles', async (req, res) => {
        try {
            const guild = await getGuild();
            let rolesList = [];

            if (guild) {
                rolesList = Array.from(guild.roles.cache.values())
                    .filter(r => r.id !== guild.id)
                    .map(r => ({
                        id: r.id,
                        name: r.name,
                        color: (r.color && r.color !== 0) ? `#${r.color.toString(16).padStart(6, '0')}` : '#99aab5',
                        rawColor: r.color || 0,
                        position: r.position,
                        icon: r.iconURL ? r.iconURL({ size: 64 }) : null,
                        unicodeEmoji: r.unicodeEmoji || null,
                        hoist: r.hoist,
                        memberCount: r.members ? r.members.size : 0
                    }))
                    .sort((a, b) => b.position - a.position);
            }

            // Fallback vers le cache BDD discord_roles
            if (rolesList.length === 0) {
                try {
                    const dbRes = await db.pool.query(`
                        SELECT role_id, name, color, color_hex, icon_url, unicode_emoji, member_count, hoist, position
                        FROM discord_roles
                        WHERE deleted_at IS NULL
                        ORDER BY position DESC
                    `);
                    rolesList = dbRes.rows.map(r => ({
                        id: r.role_id,
                        name: r.name,
                        color: r.color_hex || (r.color && r.color !== 0 ? `#${r.color.toString(16).padStart(6, '0')}` : '#99aab5'),
                        rawColor: r.color || 0,
                        position: r.position || 0,
                        icon: r.icon_url || null,
                        unicodeEmoji: r.unicode_emoji || null,
                        hoist: r.hoist === 1,
                        memberCount: r.member_count || 0
                    }));
                } catch (e) {
                    logger.warn(`Échec fallback BDD pour les rôles: ${e.message}`, 'API');
                }
            }

            res.json({ success: true, data: rolesList });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 7. SALON VIRTUEL : CONFIGURATION DU BOT & MODULES
    // ============================================
    router.get('/modules/status', (req, res) => {
        try {
            const { getModulesStatusList } = require('../utils/modulesSummary.js');
            res.json({
                success: true,
                data: getModulesStatusList()
            });
        } catch (error) {
            logger.error(`Erreur GET /api/modules/status: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/config', async (req, res) => {
        try {
            const { getConfig } = require('../config/index.js');
            const { getModulesStatusList } = require('../utils/modulesSummary.js');
            const fullConfig = getConfig();

            res.json({
                success: true,
                data: {
                    modules: getModulesStatusList(),
                    welcome: fullConfig.welcome || {},
                    captcha: fullConfig.captcha || {},
                    xp: fullConfig.welcome?.xp || fullConfig.xp || {},
                    daily_message: fullConfig.daily_message || {},
                    startup_notifier: fullConfig.startup_notifier || {},
                    counter: fullConfig.counter || {},
                    countdown: fullConfig.countdown || {},
                    web: fullConfig.web || {},
                    scheduler: fullConfig.scheduler || {},
                    commands: fullConfig.discord?.commands || {},
                    discord: {
                        client_id: fullConfig.discord?.client_id || process.env.CLIENT_ID || '',
                        guild_id: fullConfig.discord?.guild_id || process.env.GUILD_ID || '',
                        default_color: fullConfig.discord?.default_color || process.env.BOT_COLOR || '#f2c7ce',
                        commands: fullConfig.discord?.commands || {}
                    },
                    env: {
                        dailyMessageChannelId: fullConfig.daily_message?.channel_id || process.env.DAILY_MESSAGE_CHANNEL_ID || '',
                        notificationChannelId: fullConfig.startup_notifier?.channel_id || process.env.LOG_CHANNEL_ID || '',
                        openrouterModel: fullConfig.openrouter?.default_model || fullConfig.daily_message?.ai_config?.model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free'
                    },
                    fullConfig
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/config: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/config', rateLimiters.sensitive, requireRole('admin'), async (req, res) => {
        const { module, config: moduleConfig } = req.body;

        if (!module || !moduleConfig) {
            return res.status(400).json({ success: false, error: 'Module et configuration requis' });
        }

        try {
            const { getConfig, saveModuleConfig } = require('../config/index.js');
            if (module === 'commands') {
                const conf = getConfig();
                conf.discord = conf.discord || {};
                conf.discord.commands = moduleConfig;
                saveModuleConfig('discord', conf.discord);
            } else {
                saveModuleConfig(module, moduleConfig);
            }
            logger.info(`Configuration du module ${module} mise à jour avec succès dans config.yml`, 'CONFIG');

            res.json({ success: true, message: `Configuration du module ${module} sauvegardée avec succès dans config.yml !` });
        } catch (error) {
            logger.error(`Erreur POST /api/config (${module}): ${error.message}`, 'CONFIG');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 7. SALON VIRTUEL : DAILY MESSAGES (HISTORIQUE ET INFOS DE GÉNÉRATION)
    // ============================================
    router.get('/daily-messages', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { DailyMessageService } = require('../modules/feature_daily-message/daily-message.service.js');
            const dailyService = container.resolve(DailyMessageService);
            const conf = getConfig ? getConfig() : config;

            // 1. Récupérer le brouillon en attente ou validé
            let pending = null;
            try {
                pending = await dailyService.getPendingDraft();
            } catch (e) {
                logger.warn(`Impossible de récupérer le brouillon daily message: ${e.message}`, 'API');
            }

            // 2. Récupérer l'historique complet depuis openaimessages
            const query = `
                SELECT * FROM openaimessages 
                ORDER BY created_at DESC 
                LIMIT 100
            `;
            const result = await db.pool.query(query);
            const rawMessages = result.rows || [];

            // Créer une map pour faire correspondre le prompt créatif (étape 1) et le message final (étape 2)
            const promptMap = new Map();
            rawMessages.forEach(m => {
                if (m.msgid && (m.msgid.startsWith('prompt_') || !m.previousmsgid)) {
                    promptMap.set(m.msgid, m);
                }
            });

            const defaultModel = conf.daily_message?.ai_config?.model || conf.openrouter?.default_model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

            const history = rawMessages.map(m => {
                let step1Data = null;
                if (m.previousmsgid && promptMap.has(m.previousmsgid)) {
                    step1Data = promptMap.get(m.previousmsgid);
                }

                let tokens = {
                    input: m.tokeninput || 0,
                    output: m.tokenoutput || 0,
                    total: (m.tokeninput || 0) + (m.tokenoutput || 0)
                };

                let step1Tokens = step1Data ? {
                    input: step1Data.tokeninput || 0,
                    output: step1Data.tokenoutput || 0,
                    total: (step1Data.tokeninput || 0) + (step1Data.tokenoutput || 0)
                } : null;

                return {
                    id: m.id,
                    msgId: m.msgid,
                    content: m.content || '',
                    prompt: m.prompt || '',
                    instruction: m.instruction || '',
                    model: m.model || defaultModel,
                    tokens,
                    previousMsgId: m.previousmsgid,
                    step1: step1Data ? {
                        msgId: step1Data.msgid,
                        metaPrompt: step1Data.prompt,
                        creativePrompt: step1Data.content,
                        model: step1Data.model || defaultModel,
                        tokens: step1Tokens,
                        createdAt: step1Data.created_at
                    } : null,
                    createdAt: m.created_at,
                    updatedAt: m.updated_at
                };
            });

            // Statistiques globales
            const totalMessages = history.length;
            const totalTokens = history.reduce((acc, cur) => acc + cur.tokens.total, 0);

            const configuredModel = conf.daily_message?.ai_config?.model || conf.openrouter?.default_model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';
            const configuredChannelId = conf.daily_message?.channel_id || process.env.DAILY_MESSAGE_CHANNEL_ID || '1337807772024180756';
            const configuredPreviewChannelId = conf.daily_message?.preview_channel_id || process.env.LOG_CHANNEL_ID;

            res.json({
                success: true,
                data: {
                    pending,
                    pendingPublish: pending,
                    stats: {
                        totalMessages,
                        totalTokens,
                        configuredChannelId,
                        configuredPreviewChannelId,
                        configuredModel,
                        scheduleTime: '09:00',
                        previewTime: '21:00'
                    },
                    env: {
                        dailyMessageChannelId: configuredChannelId,
                        configuredModel,
                        openaiModel: configuredModel
                    },
                    history
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/daily-messages: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Générer un brouillon / test de message du jour
    const handleGenerateDraft = async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { DailyMessageService } = require('../modules/feature_daily-message/daily-message.service.js');
            const dailyService = container.resolve(DailyMessageService);
            const dailyData = await dailyService.generateDailyMessageContent(new Date());
            await dailyService.saveCurrentDraft(dailyData);

            res.json({
                success: true,
                data: {
                    ...dailyData,
                    content: dailyData.text,
                    metaPrompt: dailyData.metaPrompt,
                    creativePrompt: dailyData.promptResponse?.text,
                    finalPrompt: dailyData.finalPrompt,
                    finalInstruction: dailyData.finalInstruction,
                    usage: dailyData.messageResponse?.usage
                },
                message: 'Nouveau brouillon généré avec succès !'
            });
        } catch (error) {
            logger.error(`Erreur génération daily message: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    };

    router.post('/daily-messages/generate-test', rateLimiters.aiGeneration, handleGenerateDraft);
    router.post('/daily-messages/generate-preview', rateLimiters.aiGeneration, handleGenerateDraft);
    router.post('/daily-messages/generate', rateLimiters.aiGeneration, handleGenerateDraft);

    // Accepter / valider le brouillon pour diffusion à 09:00
    router.post('/daily-messages/accept', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { DailyMessageService } = require('../modules/feature_daily-message/daily-message.service.js');
            const dailyService = container.resolve(DailyMessageService);
            const accepted = await dailyService.acceptDraft(req.body?.draft);

            res.json({
                success: true,
                data: accepted,
                message: 'Brouillon validé et programmé pour diffusion à 09:00 !'
            });
        } catch (error) {
            logger.error(`Erreur accept daily message: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Refuser / supprimer le brouillon en cours
    router.post('/daily-messages/reject', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { DailyMessageService } = require('../modules/feature_daily-message/daily-message.service.js');
            const dailyService = container.resolve(DailyMessageService);
            await dailyService.rejectDraft();

            res.json({
                success: true,
                message: 'Brouillon refusé et supprimé.'
            });
        } catch (error) {
            logger.error(`Erreur reject daily message: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Refuser et régénérer immédiatement
    router.post('/daily-messages/regenerate', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { DailyMessageService } = require('../modules/feature_daily-message/daily-message.service.js');
            const dailyService = container.resolve(DailyMessageService);
            const newDraft = await dailyService.regenerateDraft(new Date());

            res.json({
                success: true,
                data: {
                    ...newDraft,
                    content: newDraft.text
                },
                message: 'Nouveau brouillon régénéré avec succès !'
            });
        } catch (error) {
            logger.error(`Erreur regenerate daily message: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Publier immédiatement sur Discord
    const handlePublishNow = async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { DailyMessageService } = require('../modules/feature_daily-message/daily-message.service.js');
            const dailyService = container.resolve(DailyMessageService);

            const text = req.body?.text || req.body?.content;
            let draft = text ? { text, model: 'manual' } : await dailyService.getPendingDraft();
            if (!draft) {
                draft = await dailyService.generateDailyMessageContent(new Date());
            }

            await dailyService.executePublication(client, draft);
            await dailyService.rejectDraft();

            res.json({
                success: true,
                message: 'Message du jour publié immédiatement sur Discord !'
            });
        } catch (error) {
            logger.error(`Erreur publication immédiate daily message: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    };

    router.post('/daily-messages/publish-now', handlePublishNow);
    router.post('/daily-messages/publish', handlePublishNow);

    // ============================================
    // 7.B OPENROUTER : MODÈLES DYNAMIQUES & RETRY POLICY (POLLY-LIKE)
    // ============================================
    router.get('/openrouter/models', async (req, res) => {
        try {
            const { getOpenRouterModelsList } = require('../utils/openrouter.js');
            const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
            const models = await getOpenRouterModelsList(forceRefresh);
            res.json({
                success: true,
                count: models.length,
                data: models
            });
        } catch (error) {
            logger.error(`Erreur GET /api/openrouter/models: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/openrouter/config', async (req, res) => {
        try {
            const { getConfig, config } = require('../config/index.js');
            const { getFallbackModelsFromConfig } = require('../utils/openrouter.js');
            const currentConfig = getConfig ? getConfig() : config;
            const openrouterConfig = currentConfig.openrouter || {};
            res.json({
                success: true,
                data: {
                    default_model: openrouterConfig.default_model || 'openai/gpt-oss-20b:free',
                    fallback_models: getFallbackModelsFromConfig(),
                    retry_policy: openrouterConfig.retry_policy || {
                        enabled: true,
                        max_retries: 3,
                        initial_delay_ms: 1000,
                        backoff_factor: 2.0,
                        max_delay_ms: 8000,
                        jitter: true,
                        timeout_ms: 25000,
                        retryable_statuses: [408, 429, 500, 502, 503, 504]
                    }
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/openrouter/config: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/openrouter/config', async (req, res) => {
        try {
            const { saveConfig, getConfig, config } = require('../config/index.js');
            const currentConfig = getConfig ? getConfig() : config;
            if (!currentConfig.openrouter) currentConfig.openrouter = {};

            if (req.body.default_model !== undefined) {
                currentConfig.openrouter.default_model = req.body.default_model;
            }
            if (Array.isArray(req.body.fallback_models)) {
                currentConfig.openrouter.fallback_models = req.body.fallback_models;
            }
            if (req.body.retry_policy && typeof req.body.retry_policy === 'object') {
                currentConfig.openrouter.retry_policy = {
                    ...currentConfig.openrouter.retry_policy,
                    ...req.body.retry_policy
                };
            }

            saveConfig(currentConfig);
            res.json({
                success: true,
                message: 'Configuration OpenRouter & Polly Retry mise à jour avec succès !',
                data: currentConfig.openrouter
            });
        } catch (error) {
            logger.error(`Erreur POST /api/openrouter/config: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 8. SALON VIRTUEL : CAPTCHA LOGS (HISTORIQUE ET SÉCURITÉ)
    // ============================================
    router.get('/captcha-logs', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { SecurityQuestionService } = require('../modules/security_question/security-question.service.js');
            const service = container.resolve(SecurityQuestionService);
            const overview = await service.getCaptchaOverview();
            res.json({
                success: true,
                data: overview
            });
        } catch (error) {
            logger.error(`Erreur GET /api/captcha-logs: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get(['/captcha-logs/messages', '/captcha-logs/:channelId/messages', '/captcha/messages'], async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { SecurityQuestionService } = require('../modules/security_question/security-question.service.js');
            const service = container.resolve(SecurityQuestionService);
            const channelId = req.params?.channelId || req.query?.channel_id || req.query?.channelId;
            const userId = req.query?.user_id || req.query?.userId;
            const guildId = req.query?.guild_id || req.query?.guildId;

            const history = await service.getChannelHistory(channelId, userId, guildId);
            res.json({
                success: true,
                data: history
            });
        } catch (error) {
            logger.error(`Erreur GET /api/captcha-logs/messages: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });


    // ============================================
    // 8. SERVICE : RAPPELS DE BUMP DISBOARD
    // ============================================
    router.get('/bump', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { BumpReminderService } = require('../modules/service_bump-reminder/bump-reminder.service.js');
            const service = container.resolve(BumpReminderService);
            const status = await service.getBumpStatus();
            res.json({ success: true, data: status });
        } catch (error) {
            logger.error(`Erreur GET /api/bump: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/bump/status', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { BumpReminderService } = require('../modules/service_bump-reminder/bump-reminder.service.js');
            const service = container.resolve(BumpReminderService);
            const status = await service.getBumpStatus();
            res.json({ success: true, data: status });
        } catch (error) {
            logger.error(`Erreur GET /api/bump/status: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/bump/config', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { BumpReminderController } = require('../modules/service_bump-reminder/bump-reminder.controller.js');
            const controller = container.resolve(BumpReminderController);
            const result = await controller.saveConfig(req);
            res.json(result);
        } catch (error) {
            logger.error(`Erreur POST /api/bump/config: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/bump/test-reminder', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { BumpReminderController } = require('../modules/service_bump-reminder/bump-reminder.controller.js');
            const controller = container.resolve(BumpReminderController);
            req.app = req.app || {};
            req.app.get = () => client;
            const result = await controller.remindNow(req);
            res.json(result);
        } catch (error) {
            logger.error(`Erreur POST /api/bump/test-reminder: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/bump/cleanup-tests', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { BumpReminderController } = require('../modules/service_bump-reminder/bump-reminder.controller.js');
            const controller = container.resolve(BumpReminderController);
            const result = await controller.cleanupTests(req);
            res.json(result);
        } catch (error) {
            logger.error(`Erreur POST /api/bump/cleanup-tests: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/bump/delete-log', async (req, res) => {
        try {
            const { container } = require('../core/container.js');
            const { BumpReminderController } = require('../modules/service_bump-reminder/bump-reminder.controller.js');
            const controller = container.resolve(BumpReminderController);
            const result = await controller.deleteLog(req);
            res.json(result);
        } catch (error) {
            logger.error(`Erreur POST /api/bump/delete-log: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 9. JEUX : COMPTEUR & COUNTDOWN
    // ============================================
    router.get('/games/counter', async (req, res) => {
        try {
            const { getConfig } = require('../config/index.js');
            const conf = getConfig();
            const channelId = conf.counter?.channel_id || '1533492692825276598';
            const state = await db.getCounterState(channelId);
            const scores = await db.getCountdownScores(channelId);
            res.json({
                success: true,
                data: {
                    channelId,
                    state: state || { current_number: 0, last_user_id: null },
                    scores: scores || [],
                    config: conf.counter || {}
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/games/countdown', async (req, res) => {
        try {
            const { getConfig } = require('../config/index.js');
            const conf = getConfig();
            const channelId = conf.countdown?.channel_id || '1533492760697503805';
            const state = await db.getCountdownState(channelId);
            const scores = await db.getCountdownScores(channelId);
            res.json({
                success: true,
                data: {
                    channelId,
                    state: state || { current_number: conf.countdown?.start_number || 900, is_trap_active: 0 },
                    scores: scores || [],
                    config: conf.countdown || {}
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Vue d'ensemble agrégée des jeux pour le dashboard (Phase 8.4)
    router.get('/games/stats', async (req, res) => {
        try {
            const { getConfig } = require('../config/index.js');
            const conf = getConfig();
            const counterChannel = conf.counter?.channel_id;
            const countdownChannel = conf.countdown?.channel_id;
            const [counterState, countdownState, counterScores, countdownScores] = await Promise.all([
                counterChannel ? db.getCounterState(counterChannel).catch(() => null) : null,
                countdownChannel ? db.getCountdownState(countdownChannel).catch(() => null) : null,
                counterChannel ? db.getCountdownScores(counterChannel, 100).catch(() => []) : [],
                countdownChannel ? db.getCountdownScores(countdownChannel, 100).catch(() => []) : []
            ]);
            res.json({
                success: true,
                data: {
                    counter: {
                        configured: !!counterChannel,
                        channelId: counterChannel,
                        state: counterState,
                        topPlayers: counterScores.slice(0, 10)
                    },
                    countdown: {
                        configured: !!countdownChannel,
                        channelId: countdownChannel,
                        state: countdownState,
                        topPlayers: countdownScores.slice(0, 10)
                    },
                    enabled: {
                        counter: conf.counter?.enabled !== false,
                        countdown: conf.countdown?.enabled !== false
                    }
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/games/stats: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 9. COMMANDES DU BOT & PERMISSIONS
    // ============================================
    router.get('/commands', async (req, res) => {
        try {
            const { getConfig } = require('../config/index.js');
            const conf = getConfig();
            const cmdConfig = conf.discord?.commands || {};
            const commandsList = [];

            if (client.commands) {
                const seen = new Set();
                client.commands.forEach((cmd, name) => {
                    const cmdName = cmd.data?.name || name;
                    if (!seen.has(cmdName.toLowerCase())) {
                        seen.add(cmdName.toLowerCase());
                        commandsList.push({
                            name: cmdName,
                            description: cmd.data?.description || cmd.description || 'Pas de description',
                            options: cmd.data?.options || [],
                            module: cmd.module || 'Système',
                            type: cmd.executeSlash ? 'Slash Command' : 'Prefix Command',
                            adminOnly: !!cmdConfig.permissions?.[cmdName]?.admin_only,
                            allowedRoles: cmdConfig.permissions?.[cmdName]?.allowed_roles || [],
                            allowedChannels: cmdConfig.permissions?.[cmdName]?.allowed_channels || []
                        });
                    }
                });
            }

            res.json({
                success: true,
                data: {
                    globalEnabled: cmdConfig.enabled !== false,
                    commands: commandsList,
                    config: cmdConfig
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/commands/sync', rateLimiters.sensitive, requireRole('admin'), async (req, res) => {
        try {
            const { syncDiscordSlashCommands } = require('../utils/commandDeployer.js');
            const result = await syncDiscordSlashCommands(client, req.body || {});
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 10. ARCHIVE DES ÉVÉNEMENTS DISCORD
    // ============================================
    router.get('/events/archive', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const offset = parseInt(req.query.offset) || 0;
            const eventName = req.query.eventName || null;
            const category = req.query.category || null;
            const search = req.query.search || null;

            const data = await db.getDiscordEventsArchive({ limit, offset, eventName, category, search });
            res.json({
                success: true,
                data
            });
        } catch (error) {
            logger.error(`Erreur GET /api/events/archive: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 11. MOTEUR DE TEMPLATES DISCORD (RENDER & PRESETS)
    // ============================================
    const templateEngine = require("../utils/templateEngine.js");

    router.post('/template/render', (req, res) => {
        try {
            const { template, context } = req.body || {};
            if (!template) {
                return res.status(400).json({ success: false, error: 'Paramètre "template" manquant.' });
            }

            const compiled = templateEngine.renderDiscordMessage(template, context || {});
            res.json({
                success: true,
                data: compiled
            });
        } catch (error) {
            logger.error(`Erreur POST /api/template/render: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/template/presets', (req, res) => {
        const presets = [
            {
                id: 'leaderboard',
                name: '🏆 Classement Général (Boucle & Emojis)',
                category: 'GAMES',
                template: {
                    content: '🏆 **Classement officiel de {{ guild.name }}**',
                    embed: {
                        title: 'Classement Général des Membres',
                        description: 'Voici le top des membres les plus actifs :\n\n{% for u in leaderboard %}{% if loop.index == 1 %}🥇{% elif loop.index == 2 %}🥈{% elif loop.index == 3 %}🥉{% else %}**#{{ loop.index }}**{% endif %} {{ u.id | userMention }} — **{{ u.xp | number }} XP** (Niveau {{ u.level }})\n{% endfor %}',
                        color: '#F1C40F',
                        fields: [
                            { name: 'Total Joueurs', value: '{{ totalPlayers | number }} membres', inline: true },
                            { name: 'Saison Actuelle', value: 'Saison {{ season }}', inline: true }
                        ],
                        footer: {
                            text: 'Mis à jour à {{ now | date("HH:mm") }} • {{ guild.name }}',
                            icon_url: '{{ guild.iconUrl }}'
                        }
                    }
                },
                context: {
                    guild: {
                        name: 'Obsydian',
                        iconUrl: 'https://cdn.discordapp.com/embed/avatars/0.png'
                    },
                    now: new Date().toISOString(),
                    season: 4,
                    totalPlayers: 1250,
                    leaderboard: [
                        { id: '1337543177086959657', name: 'Alex', xp: 45200, level: 42 },
                        { id: '1337543177086959658', name: 'Sarah', xp: 38900, level: 36 },
                        { id: '1337543177086959659', name: 'Lucas', xp: 29400, level: 28 },
                        { id: '1337543177086959660', name: 'Emma', xp: 21300, level: 22 },
                        { id: '1337543177086959661', name: 'Maxime', xp: 18500, level: 19 }
                    ]
                }
            },
            {
                id: 'welcome',
                name: '👋 Message de Bienvenue (Embed & Mentions)',
                category: 'WELCOME',
                template: {
                    content: '👋 Bienvenue sur le serveur, {{ member.id | userMention }} !',
                    embed: {
                        title: '🎉 Bienvenue chez {{ guild.name }} !',
                        description: "Nous sommes ravis de t'accueillir parmi nous !\n\nN'hésite pas à consulter les salons suivants :\n• {{ rulesChannelId | channelMention }} pour le règlement\n• {{ generalChannelId | channelMention }} pour faire connaissance\n• {{ rolesChannelId | channelMention }} pour choisir tes rôles",
                        color: '#5865F2',
                        thumbnail: '{{ member.avatarUrl }}',
                        fields: [
                            { name: 'Membre n°', value: '{{ guild.memberCount | number }}', inline: true },
                            { name: 'Compte créé', value: '{{ member.createdAt | timeAgo }}', inline: true }
                        ],
                        footer: {
                            text: "{{ guild.name }} • Système d'Accueil",
                            icon_url: '{{ guild.iconUrl }}'
                        }
                    }
                },
                context: {
                    guild: {
                        name: 'Obsydian',
                        memberCount: 1542,
                        iconUrl: 'https://cdn.discordapp.com/embed/avatars/0.png'
                    },
                    member: {
                        id: '1337543177086959657',
                        username: 'NouveauMembre',
                        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
                        createdAt: new Date(Date.now() - 86400000 * 45).toISOString()
                    },
                    rulesChannelId: '1337543177086959660',
                    generalChannelId: '1337543177086959661',
                    rolesChannelId: '1337543177086959662'
                }
            },
            {
                id: 'bump-reminder',
                name: '🔔 Rappel de Bump Disboard',
                category: 'BUMP',
                template: {
                    content: '{{ roleId | roleMention }} C\'est l\'heure de faire monter le serveur !',
                    embed: {
                        title: '⏰ Le Bump Disboard est de nouveau disponible !',
                        description: 'Tapez **/bump** pour aider **{{ guild.name }}** à gagner en visibilité et attirer de nouveaux membres !\n\nMerci au dernier bumper : {{ lastBumper.id | userMention }} 💖',
                        color: '#2ECC71',
                        fields: [
                            { name: 'Dernier Bump', value: '{{ lastBumpDate | timeAgo }}', inline: true },
                            { name: 'Total Bumps ce mois', value: '{{ totalBumpsThisMonth | number }}', inline: true }
                        ],
                        footer: {
                            text: 'Rappel automatique • Prochain rappel dans 2h'
                        }
                    }
                },
                context: {
                    guild: { name: 'Obsydian' },
                    roleId: '1337543177086959999',
                    lastBumper: { id: '1337543177086959657', username: 'SuperBumper' },
                    lastBumpDate: new Date(Date.now() - 7200000).toISOString(),
                    totalBumpsThisMonth: 142
                }
            },
            {
                id: 'xp-levelup',
                name: '⭐ Montée de Niveau XP',
                category: 'XP',
                template: {
                    content: '✨ Félicitations {{ user.id | userMention }} !',
                    embed: {
                        title: '⭐ Montée de Niveau !',
                        description: 'Bravo **{{ user.username }}**, tu viens de passer au **NIVEAU {{ newLevel }}** ! 🎉\n\n{% if hasReward %}🎁 **Récompense débloquée :** Tu obtiens le rôle {{ rewardRole.id | roleMention }} !{% endif %}',
                        color: '#E67E22',
                        thumbnail: '{{ user.avatarUrl }}',
                        fields: [
                            { name: 'Niveau', value: '{{ oldLevel }} ➔ **{{ newLevel }}**', inline: true },
                            { name: 'XP Total', value: '{{ totalXp | number }} XP', inline: true }
                        ],
                        footer: {
                            text: 'Système d\'expérience • {{ guild.name }}'
                        }
                    }
                },
                context: {
                    guild: { name: 'Obsydian' },
                    user: {
                        id: '1337543177086959657',
                        username: 'ObsyGamer',
                        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png'
                    },
                    oldLevel: 19,
                    newLevel: 20,
                    totalXp: 15400,
                    hasReward: true,
                    rewardRole: { id: '1337543177086959999', name: 'Élite Obsydian' }
                }
            },
            {
                id: 'daily-thought',
                name: '🌅 Pensée du Jour IA',
                category: 'AI',
                template: {
                    content: '🌅 **La Pensée du Jour — {{ now | date("DD/MM/YYYY") }}**',
                    embed: {
                        title: '« {{ quote.title }} »',
                        description: '*{{ quote.text }}*\n\n— **{{ quote.author }}**',
                        color: '#9B59B6',
                        fields: [
                            { name: 'Thème', value: '{{ theme }}', inline: true },
                            { name: 'Généré par', value: 'Bot IA', inline: true }
                        ],
                        footer: {
                            text: 'Passez une excellente journée sur {{ guild.name }} !'
                        }
                    }
                },
                context: {
                    guild: { name: 'Obsydian' },
                    now: new Date().toISOString(),
                    theme: 'Persévérance & Innovation',
                    quote: {
                        title: 'Le voyage vers les étoiles',
                        text: 'Chaque pas en avant, même infime, nous rapproche du sommet de la montagne.',
                        author: 'Sénèque'
                    }
                }
            }
        ];

        res.json({
            success: true,
            data: presets
        });
    });

    return router;
}

module.exports = createWebRouter;

