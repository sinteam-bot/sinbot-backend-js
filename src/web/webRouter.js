const express = require('express');
const path = require('path');
const fs = require('fs');
const { ChannelType } = require('discord.js');
const logger = require("../utils/logger.js");
const db = require("../database.js");

function createWebRouter(client) {
    const router = express.Router();

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

            let guildInfo = {
                id: guild?.id || process.env.GUILD_ID || 'server-demo',
                name: guild?.name || 'Serveur Discord',
                icon: guild?.icon ? guild.iconURL({ dynamic: true, size: 256 }) : null,
                memberCount: guild?.memberCount || 0,
                botOnline: client?.isReady() || false,
                bot: {
                    id: botUser?.id || null,
                    username: botUser?.username || 'Chienne Bot',
                    tag: botUser?.tag || 'Chienne Bot#0001',
                    avatar: botUser ? getUserAvatar(botUser) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                    status: 'online'
                }
            };

            res.json({ success: true, data: guildInfo });
        } catch (error) {
            logger.error(`Erreur GET /api/guild: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 2. LISTE DES SALONS (RÉELS + CATÉGORIE VIRTUELLE)
    // ============================================
    router.get('/channels', async (req, res) => {
        try {
            const guild = await getGuild();
            const virtualCategory = {
                id: 'cat-virtual-chienne-bot',
                name: 'CHIENNE BOT',
                isVirtual: true,
                position: -100,
                channels: [
                    {
                        id: 'virtual-logs',
                        name: '📜-logs',
                        type: 'virtual',
                        icon: 'scroll',
                        topic: 'Logs et événements du bot en temps réel',
                        unread: false
                    },
                    {
                        id: 'virtual-config',
                        name: '⚙️-config',
                        type: 'virtual',
                        icon: 'gear',
                        topic: 'Configuration générale et modules du bot (Accueil, Captcha, XP, Messages)',
                        unread: false
                    },
                    {
                        id: 'virtual-users',
                        name: '👥-users',
                        type: 'virtual',
                        icon: 'users',
                        topic: 'Liste des membres avec filtres avancés par rôles et statistiques XP',
                        unread: false
                    },
                    {
                        id: 'virtual-daily-messages',
                        name: '🌅-daily-messages',
                        type: 'virtual',
                        icon: 'sun',
                        topic: 'Historique des Daily Messages avec métadonnées de génération IA, prompts et tokens',
                        unread: false
                    },
                    {
                        id: 'virtual-captcha-logs',
                        name: '🛡️-captcha-logs',
                        type: 'virtual',
                        icon: 'shield',
                        topic: 'Historique des vérifications Captcha, tentatives des membres et logs de sécurité',
                        unread: false
                    }
                ]
            };

            const categories = [virtualCategory];
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
                // Fallback BDD SQLite si Discord offline
                try {
                    const dbChannelsRes = await db.pool.query(`
                        SELECT * FROM discord_channels ORDER BY position ASC
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

            res.json({ success: true, data: categories });
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
                        createdAt: msg.createdAt ? msg.createdAt.toISOString() : new Date().toISOString(),
                        pinned: msg.pinned,
                        editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
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
                // Fallback BDD SQLite
                let sql = `
                    SELECT m.*, u.global_name, u.avatar_url, u.bot
                    FROM discord_messages m
                    LEFT JOIN discord_users u ON m.author_id = u.user_id
                    WHERE m.channel_id = ?
                `;
                const params = [channelId];

                if (before) {
                    sql += ` AND m.created_at < (SELECT created_at FROM discord_messages WHERE message_id = ?)`;
                    params.push(before);
                }

                sql += ` ORDER BY m.created_at DESC LIMIT ?`;
                params.push(limit);

                const dbRes = await db.pool.query(sql, params);
                hasMore = dbRes.rows.length >= limit;

                messagesList = dbRes.rows.map(row => {
                    let embeds = [];
                    let attachments = [];
                    let reactions = [];
                    try { embeds = JSON.parse(row.embeds_json || '[]'); } catch (e) { }
                    try { attachments = JSON.parse(row.attachments_json || '[]'); } catch (e) { }
                    try { reactions = JSON.parse(row.reactions_json || '[]'); } catch (e) { }

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
    router.post('/channels/:channelId/messages', async (req, res) => {
        const { channelId } = req.params;
        const { content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, error: 'Contenu du message vide' });
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
                await channel.setArchived(false).catch(() => {});
            }

            const sentMessage = await channel.send(content.trim());
            logger.info(`Message envoyé sur ${channel.isThread?.() ? 'le fil' : '#'}${channel.name} par interface Web`, 'WEB');

            res.json({
                success: true,
                data: {
                    id: sentMessage.id,
                    content: sentMessage.content,
                    createdAt: sentMessage.createdAt.toISOString()
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
                    const starter = await th.fetchStarterMessage().catch(() => null);
                    if (starter) starterContent = starter.content || '';
                } catch (e) { }

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
                    createdAt: th.createdAt ? th.createdAt.toISOString() : null,
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

    router.post('/channels/:channelId/posts', async (req, res) => {
        const { channelId } = req.params;
        const { title, content, appliedTags } = req.body;

        if (!title || !title.trim() || !content || !content.trim()) {
            return res.status(400).json({ success: false, error: 'Titre et message initial requis' });
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
    router.patch('/channels/:channelId/messages/:messageId', async (req, res) => {
        const { channelId, messageId } = req.params;
        const { content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, error: 'Le contenu du message ne peut pas être vide' });
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
                editedAt = editedMessage.editedAt ? editedMessage.editedAt.toISOString() : new Date().toISOString();
                logger.info(`Message ${messageId} modifié sur #${channel.name} par interface Web`, 'WEB');
            }

            // Mettre à jour dans la base SQLite si présent
            try {
                await db.pool.query(
                    'UPDATE discord_messages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE message_id = ?',
                    [editedContent, messageId]
                );
            } catch (e) { }

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
    router.delete('/channels/:channelId/messages/:messageId', async (req, res) => {
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

            // Supprimer de la base SQLite si présent
            try {
                await db.pool.query(
                    'DELETE FROM discord_messages WHERE message_id = ?',
                    [messageId]
                );
            } catch (e) { }

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

    // ============================================
    // 5. SALON VIRTUEL : LOGS DU BOT (CONSULTATION & SSE)
    // ============================================
    router.get('/logs', (req, res) => {
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
                try {
                    await guild.members.fetch();
                } catch (e) { }

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
                            color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#99aab5',
                            position: r.position
                        }))
                        .sort((a, b) => b.position - a.position);

                    membersList.push({
                        id: member.id,
                        username: member.user.username,
                        globalName: member.user.globalName || member.user.username,
                        displayName: member.displayName,
                        discriminator: member.user.discriminator,
                        tag: member.user.tag,
                        avatar: getUserAvatar(member.user, member),
                        isBot: member.user.bot,
                        joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
                        createdAt: member.user.createdAt ? member.user.createdAt.toISOString() : null,
                        highestRole: highestRole ? { id: highestRole.id, name: highestRole.name, color: roleColor } : null,
                        roles: roles,
                        presence: member.presence ? member.presence.status : 'offline'
                    });
                });
            } else {
                // Fallback BDD SQLite
                const dbRes = await db.pool.query(`
                    SELECT sm.*, ux.xp, ux.level, ux.messages_count, ux.voice_minutes
                    FROM server_members sm
                    LEFT JOIN user_xp ux ON sm.user_id = ux.user_id
                `);

                membersList = dbRes.rows.map(row => {
                    let roles = [];
                    try { roles = JSON.parse(row.roles || '[]'); } catch (e) { }
                    return {
                        id: row.user_id,
                        username: row.username,
                        globalName: row.display_name || row.username,
                        displayName: row.display_name || row.username,
                        discriminator: row.discriminator || '0000',
                        tag: row.tag || `${row.username}#${row.discriminator || '0000'}`,
                        avatar: row.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png',
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
            } catch (e) { }

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
                data: {
                    users: paginated,
                    total,
                    page: p,
                    limit: l,
                    totalPages: Math.ceil(total / l)
                }
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
                        color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#99aab5',
                        position: r.position,
                        memberCount: r.members.size
                    }))
                    .sort((a, b) => b.position - a.position);
            }

            res.json({ success: true, data: rolesList });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 7. SALON VIRTUEL : CONFIGURATION DU BOT
    // ============================================
    router.get('/config', async (req, res) => {
        try {
            const welcomeConfigPath = path.join(__dirname, '../config/welcome-config.js');
            const captchaConfigPath = path.join(__dirname, '../config/captcha-config.js');
            const xpConfigPath = path.join(__dirname, '../config/xp-config.js');

            let welcomeConfig = fs.existsSync(welcomeConfigPath) ? require(welcomeConfigPath) : {};
            let captchaConfig = fs.existsSync(captchaConfigPath) ? require(captchaConfigPath) : {};
            let xpConfig = fs.existsSync(xpConfigPath) ? require(xpConfigPath) : {};

            res.json({
                success: true,
                data: {
                    welcome: welcomeConfig,
                    captcha: captchaConfig,
                    xp: xpConfig,
                    env: {
                        dailyMessageChannelId: process.env.DAILY_MESSAGE_CHANNEL_ID || '',
                        notificationChannelId: process.env.LOG_CHANNEL_ID || '',
                        openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
                    }
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/config: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/config', async (req, res) => {
        const { module, config } = req.body;

        if (!module || !config) {
            return res.status(400).json({ success: false, error: 'Module et configuration requis' });
        }

        try {
            if (module === 'welcome') {
                const configPath = path.join(__dirname, '../config/welcome-config.js');
                const fileContent = `// Configuration du système d'accueil\nmodule.exports = ${JSON.stringify(config, null, 4)};\n`;
                fs.writeFileSync(configPath, fileContent, 'utf-8');
                delete require.cache[require.resolve(configPath)];
                logger.info('Configuration Welcome mise à jour avec succès', 'CONFIG');
            } else if (module === 'captcha') {
                const configPath = path.join(__dirname, '../config/captcha-config.js');
                const fileContent = `// Configuration du système de captcha\nmodule.exports = ${JSON.stringify(config, null, 4)};\n`;
                fs.writeFileSync(configPath, fileContent, 'utf-8');
                delete require.cache[require.resolve(configPath)];
                logger.info('Configuration Captcha mise à jour avec succès', 'CONFIG');
            } else if (module === 'xp') {
                const configPath = path.join(__dirname, '../config/xp-config.js');
                const fileContent = `// Configuration du système XP\nmodule.exports = ${JSON.stringify(config, null, 4)};\n`;
                fs.writeFileSync(configPath, fileContent, 'utf-8');
                delete require.cache[require.resolve(configPath)];
                logger.info('Configuration XP mise à jour avec succès', 'CONFIG');
            } else {
                return res.status(400).json({ success: false, error: 'Module non reconnu' });
            }

            res.json({ success: true, message: `Configuration du module ${module} sauvegardée avec succès !` });
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
            // 1. Récupérer le message en attente de publication (s'il existe)
            let pendingPublish = null;
            try {
                const rawPending = await db.getBotState('pending_daily_message_publish');
                if (rawPending) {
                    pendingPublish = JSON.parse(rawPending);
                }
            } catch (e) { }

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
                    model: m.model || 'gpt-4o-mini',
                    tokens,
                    previousMsgId: m.previousmsgid,
                    step1: step1Data ? {
                        msgId: step1Data.msgid,
                        metaPrompt: step1Data.prompt,
                        creativePrompt: step1Data.content,
                        model: step1Data.model,
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

            res.json({
                success: true,
                data: {
                    pendingPublish,
                    stats: {
                        totalMessages,
                        totalTokens,
                        configuredChannelId: process.env.DAILY_MESSAGE_CHANNEL_ID || '1337807772024180756',
                        configuredPreviewChannelId: process.env.LOG_CHANNEL_ID,
                        configuredModel: process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
                        scheduleTime: '09:00',
                        previewTime: '21:00'
                    },
                    history
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/daily-messages: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/daily-messages/generate-preview', async (req, res) => {
        try {
            const { generateDailyMessageContent } = require('../utils/dailyMessageManager.js');
            const dailyData = await generateDailyMessageContent(new Date());
            res.json({
                success: true,
                data: {
                    text: dailyData.text,
                    model: dailyData.model,
                    metaPrompt: dailyData.metaPrompt,
                    creativePrompt: dailyData.promptResponse?.text,
                    finalPrompt: dailyData.finalPrompt,
                    finalInstruction: dailyData.finalInstruction,
                    usage: dailyData.messageResponse?.usage
                }
            });
        } catch (error) {
            logger.error(`Erreur génération test daily message: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // 8. SALON VIRTUEL : CAPTCHA LOGS (HISTORIQUE ET SÉCURITÉ)
    // ============================================
    router.get('/captcha-logs', async (req, res) => {
        try {
            const guild = await getGuild();
            const captchaConfigPath = path.join(__dirname, '../config/captcha-config.js');
            let captchaConfig = fs.existsSync(captchaConfigPath) ? require(captchaConfigPath) : {};

            // 1. Récupérer l'historique complet de user_captchas
            const query = `
                SELECT * FROM user_captchas 
                ORDER BY created_at DESC 
                LIMIT 200
            `;
            const result = await db.pool.query(query);
            const rawCaptchas = result.rows || [];

            const now = new Date();
            const maxAttempts = captchaConfig.MAX_ATTEMPTS || 3;

            const captchas = rawCaptchas.map(c => {
                const createdAt = c.created_at ? new Date(c.created_at) : null;
                const verifiedAt = c.verified_at ? new Date(c.verified_at) : null;
                const expiresAt = c.expires_at ? new Date(c.expires_at) : null;
                const expiredAt = c.expired_at ? new Date(c.expired_at) : null;

                let status = 'pending';
                let statusLabel = 'En cours';

                if (c.is_verified === 1) {
                    status = 'verified';
                    statusLabel = 'Vérifié avec succès';
                } else if (c.attempts >= maxAttempts) {
                    status = 'failed';
                    statusLabel = 'Échec (Max tentatives)';
                } else if (expiredAt || (expiresAt && expiresAt < now)) {
                    status = 'expired';
                    statusLabel = 'Expiré (Non répondu)';
                }

                // Calculer la durée de réponse si vérifié
                let durationMs = null;
                let durationFormatted = null;
                if (verifiedAt && createdAt) {
                    durationMs = verifiedAt.getTime() - createdAt.getTime();
                    const seconds = Math.floor(durationMs / 1000);
                    if (seconds < 60) {
                        durationFormatted = `${seconds}s`;
                    } else {
                        const mins = Math.floor(seconds / 60);
                        const remSec = seconds % 60;
                        durationFormatted = `${mins}m ${remSec}s`;
                    }
                }

                return {
                    id: c.id,
                    userId: c.user_id,
                    username: c.username,
                    guildId: c.guild_id,
                    question: c.question,
                    answer: c.answer,
                    channelId: c.channel_id,
                    attempts: c.attempts || 0,
                    maxAttempts,
                    isVerified: !!c.is_verified,
                    status,
                    statusLabel,
                    durationFormatted,
                    createdAt: c.created_at,
                    expiresAt: c.expires_at,
                    verifiedAt: c.verified_at,
                    expiredAt: c.expired_at,
                    updatedAt: c.updated_at
                };
            });

            // 2. Extraire les logs en mémoire pour le tag CAPTCHA
            const memoryLogs = logger.getMemoryLogs ? logger.getMemoryLogs() : [];
            const captchaLogs = memoryLogs.filter(l => 
                l.tag === 'CAPTCHA' || 
                (l.message && (l.message.toLowerCase().includes('captcha') || l.message.toLowerCase().includes('vérif')))
            ).slice(-50).reverse();

            // 3. Calculer les statistiques
            const total = captchas.length;
            const verifiedCount = captchas.filter(c => c.status === 'verified').length;
            const pendingCount = captchas.filter(c => c.status === 'pending').length;
            const failedCount = captchas.filter(c => c.status === 'failed' || c.status === 'expired').length;
            const successRate = total > 0 ? Math.round((verifiedCount / (total - pendingCount || 1)) * 100) : 100;

            // Rôle et salon names
            let verifiedRoleName = 'Non défini';
            if (guild && captchaConfig.VERIFIED_ROLE_ID) {
                const role = guild.roles.cache.get(captchaConfig.VERIFIED_ROLE_ID);
                if (role) verifiedRoleName = `@${role.name}`;
            }

            let logChannelName = 'Non défini';
            if (guild && captchaConfig.CAPTCHA_LOG_CHANNEL) {
                const channel = guild.channels.cache.get(captchaConfig.CAPTCHA_LOG_CHANNEL);
                if (channel) logChannelName = `#${channel.name}`;
            }

            res.json({
                success: true,
                data: {
                    stats: {
                        total,
                        verifiedCount,
                        pendingCount,
                        failedCount,
                        successRate,
                        isEnabled: !!captchaConfig.ENABLED,
                        timeoutMinutes: captchaConfig.CAPTCHA_TIMEOUT || 10,
                        maxAttempts,
                        verifiedRoleName,
                        logChannelName
                    },
                    captchas,
                    logs: captchaLogs
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/captcha-logs: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createWebRouter;
