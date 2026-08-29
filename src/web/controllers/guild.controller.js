/**
 * src/web/controllers/guild.controller.js
 *
 * Informations du serveur, statut bot, emojis, rôles et synchronisation du cache.
 */

const express = require('express');
const logger = require('../../utils/logger.js');
const { pool } = require('../../db/index.js');
const { createRateLimiters, requireRole } = require('../../utils/security.js');
const { getGuild, getUserAvatar } = require('./discord-helpers.js');

function createGuildRouter(client) {
    const router = express.Router();
    const rateLimiters = createRateLimiters();

    // GET /guild ou /api/guild
    router.get('/guild', async (req, res) => {
        try {
            const guild = await getGuild(client);
            const botUser = client?.user;

            const guildEmojis = guild ? Array.from(guild.emojis?.cache?.values() || []).map(e => ({
                id: e.id,
                name: e.name,
                animated: !!e.animated,
                url: e.imageURL ? e.imageURL({ extension: e.animated ? 'gif' : 'png', size: 64 }) : `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=64&quality=lossless`
            })) : [];

            const isOnline = typeof client?.isReady === 'function' ? client.isReady() : false;

            const guildInfo = {
                id: guild?.id || process.env.GUILD_ID || 'server-demo',
                name: guild?.name || 'Serveur Discord',
                icon: guild?.icon ? (guild.iconURL ? guild.iconURL({ dynamic: true, size: 256 }) : null) : null,
                memberCount: guild?.memberCount || 0,
                botOnline: isOnline,
                emojis: guildEmojis,
                bot: {
                    id: botUser?.id || null,
                    username: botUser?.username || 'Bot',
                    tag: botUser?.tag || 'Bot#0001',
                    avatar: botUser ? getUserAvatar(botUser) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                    avatarUrl: botUser ? getUserAvatar(botUser) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                    status: isOnline ? 'online' : 'offline',
                    customStatus: isOnline ? 'En ligne' : 'Déconnecté',
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

    // GET /emojis
    router.get('/emojis', async (req, res) => {
        try {
            const guild = await getGuild(client);
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
                    const dbRes = await pool.query('SELECT emoji_id, name, animated, url FROM discord_emojis WHERE deleted_at IS NULL ORDER BY name ASC');
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

    // POST /cache/sync
    router.post('/cache/sync', rateLimiters.sensitive, requireRole('admin'), async (req, res) => {
        try {
            const guild = await getGuild(client);
            if (!guild) {
                return res.status(400).json({ success: false, error: 'Serveur Discord inaccessible pour la synchronisation' });
            }
            const DiscordCacheService = require('../../services/discordCacheService.js');
            await DiscordCacheService.syncAllDiscordCache(guild);
            res.json({ success: true, message: 'Cache Discord synchronisé avec succès en base de données.' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /roles
    router.get('/roles', async (req, res) => {
        try {
            const guild = await getGuild(client);
            let rolesList = [];

            if (guild && guild.roles) {
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
                    const dbRes = await pool.query(`
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

    return router;
}

module.exports = createGuildRouter;
