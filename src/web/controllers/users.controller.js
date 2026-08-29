/**
 * src/web/controllers/users.controller.js
 *
 * Salon virtuel : Utilisateurs, recherche, filtres par rôles/bots/XP et pagination.
 */

const express = require('express');
const logger = require('../../utils/logger.js');
const { pool } = require('../../db/index.js');
const { toISOStringSafe } = require('../../utils/dateUtils.js');
const { getGuild, getUserAvatar } = require('./discord-helpers.js');

function createUsersRouter(client) {
    const router = express.Router();
    let _lastMembersFetch = 0;

    router.param('userId', (req, res, next, value) => {
        if (!/^\d{17,20}$/.test(value)) {
            return res.status(400).json({ success: false, error: `userId invalide : "${value}"` });
        }
        next();
    });

    // GET /users
    router.get('/users', async (req, res) => {
        try {
            const guild = await getGuild(client);
            const { search, role, isBot, hasXp, sortBy = 'joined', order = 'desc', page = 1, limit = 500 } = req.query;

            let membersList = [];

            if (guild) {
                // Ne solliciter la passerelle Discord (Opcode 8) que si le cache local est vide ou après 5 minutes
                const now = Date.now();
                if (guild.members?.cache?.size === 0 || req.query.force_fetch === 'true' || (now - _lastMembersFetch > 5 * 60 * 1000)) {
                    try {
                        if (typeof guild.members?.fetch === 'function') {
                            await guild.members.fetch();
                            _lastMembersFetch = now;
                        }
                    } catch (e) {
                        if (!e.message?.includes('opcode 8') && guild.members?.cache?.size === 0) {
                            logger.warn(`Échec fetch guild.members: ${e.message}`, 'API');
                        }
                    }
                }

                const members = guild.members?.cache || new Map();
                members.forEach(member => {
                    const highestRole = member.roles?.highest;
                    const roleColor = (member.displayColor && member.displayColor !== 0)
                        ? `#${member.displayColor.toString(16).padStart(6, '0')}`
                        : null;

                    const rolesCache = member.roles?.cache ? Array.from(member.roles.cache.values()) : [];
                    const roles = rolesCache
                        .filter(r => r && r.id !== guild.id)
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
                        username: member.user?.username || 'Membre',
                        globalName: member.user?.globalName || member.user?.username || 'Membre',
                        displayName: member.displayName,
                        discriminator: member.user?.discriminator || '0000',
                        tag: member.user?.tag || member.user?.username,
                        avatar: avatarUrl,
                        avatarUrl: avatarUrl,
                        displayColor: roleColor,
                        isBot: member.user?.bot || false,
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
                const dbRes = await pool.query(`
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
                const xpStats = await pool.query('SELECT user_id, xp, level, messages_count, voice_minutes FROM user_xp');
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

    return router;
}

module.exports = createUsersRouter;
