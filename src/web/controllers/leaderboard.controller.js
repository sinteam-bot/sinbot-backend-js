/**
 * src/web/controllers/leaderboard.controller.js
 *
 * Contrôleur public pour les classements XP et Économie (Phase 7 G01).
 * Fournit un endpoint ouvert avec métadonnées OpenGraph pour intégration web / Nuxt.
 */

const express = require('express');
const { pool } = require('../../db/index.js');
const logger = require('../../utils/logger.js');
const { getGuild, getUserAvatar } = require('./discord-helpers.js');

function createLeaderboardRouter(client) {
    const router = express.Router();

    // GET /public ou GET / (selon point de montage)
    const handleLeaderboard = async (req, res) => {
        try {
            const guild = await getGuild(client);
            const guildId = req.query.guild_id || (guild ? guild.id : process.env.GUILD_ID) || 'default';
            const type = (req.query.type || 'all').toLowerCase();
            const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
            const page = Math.max(parseInt(req.query.page) || 1, 1);
            const offset = (page - 1) * limit;

            const guildInfo = {
                id: guild?.id || guildId,
                name: guild?.name || 'Serveur Discord',
                icon: guild?.iconURL ? guild.iconURL({ dynamic: true, size: 256 }) : null,
                memberCount: guild?.memberCount || 0,
                description: guild?.description || 'Classement public du serveur'
            };

            let xpLeaderboard = null;
            let economyLeaderboard = null;

            // 1. Classement XP
            if (type === 'xp' || type === 'all') {
                try {
                    const xpRes = await pool.query(
                        `SELECT ux.*, sm.username, sm.display_name, sm.avatar_url, sm.display_color
                         FROM user_xp ux
                         LEFT JOIN server_members sm ON ux.user_id = sm.user_id
                         ORDER BY ux.xp DESC, ux.level DESC 
                         LIMIT $1 OFFSET $2`,
                        [limit, offset]
                    );

                    const totalXpUsersRes = await pool.query(`SELECT COUNT(*)::int AS count FROM user_xp`);
                    const totalXpUsers = totalXpUsersRes.rows?.[0]?.count || 0;

                    xpLeaderboard = {
                        total: totalXpUsers,
                        page,
                        limit,
                        totalPages: Math.ceil(totalXpUsers / limit),
                        users: xpRes.rows.map((row, index) => {
                            const member = guild?.members?.cache?.get(row.user_id);
                            const userObj = member?.user;
                            const avatar = userObj ? getUserAvatar(userObj, member) : (row.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png');

                            return {
                                rank: offset + index + 1,
                                userId: row.user_id,
                                username: userObj?.username || row.username || 'Membre',
                                displayName: member?.displayName || row.display_name || userObj?.username || row.username || 'Membre',
                                avatarUrl: avatar,
                                displayColor: member?.displayColor ? `#${member.displayColor.toString(16).padStart(6, '0')}` : row.display_color || null,
                                xp: Number(row.xp || 0),
                                level: Number(row.level || 1),
                                messagesCount: Number(row.messages_count || 0),
                                voiceMinutes: Number(row.voice_minutes || 0)
                            };
                        })
                    };
                } catch (e) {
                    logger.warn(`Impossible de récupérer le leaderboard XP: ${e.message}`, 'LEADERBOARD');
                }
            }

            // 2. Classement Économie
            if (type === 'economy' || type === 'all') {
                try {
                    const ecoRes = await pool.query(
                        `SELECT ue.*, sm.username, sm.display_name, sm.avatar_url, sm.display_color
                         FROM user_economy ue
                         LEFT JOIN server_members sm ON ue.user_id = sm.user_id
                         WHERE ue.guild_id = $1
                         ORDER BY ue.balance DESC, ue.bank_balance DESC 
                         LIMIT $2 OFFSET $3`,
                        [guildId, limit, offset]
                    );

                    const totalEcoUsersRes = await pool.query(
                        `SELECT COUNT(*)::int AS count FROM user_economy WHERE guild_id = $1`,
                        [guildId]
                    );
                    const totalEcoUsers = totalEcoUsersRes.rows?.[0]?.count || 0;

                    economyLeaderboard = {
                        total: totalEcoUsers,
                        page,
                        limit,
                        totalPages: Math.ceil(totalEcoUsers / limit),
                        users: ecoRes.rows.map((row, index) => {
                            const member = guild?.members?.cache?.get(row.user_id);
                            const userObj = member?.user;
                            const avatar = userObj ? getUserAvatar(userObj, member) : (row.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png');

                            return {
                                rank: offset + index + 1,
                                userId: row.user_id,
                                username: userObj?.username || row.username || 'Membre',
                                displayName: member?.displayName || row.display_name || userObj?.username || row.username || 'Membre',
                                avatarUrl: avatar,
                                displayColor: member?.displayColor ? `#${member.displayColor.toString(16).padStart(6, '0')}` : row.display_color || null,
                                balance: Number(row.balance || 0),
                                bankBalance: Number(row.bank_balance || 0),
                                totalEarned: Number(row.total_earned || 0),
                                totalSpent: Number(row.total_spent || 0)
                            };
                        })
                    };
                } catch (e) {
                    logger.warn(`Impossible de récupérer le leaderboard Économie: ${e.message}`, 'LEADERBOARD');
                }
            }

            const meta = {
                title: `Classement - ${guildInfo.name}`,
                description: `Consultez le classement public des membres les plus actifs et les plus riches sur ${guildInfo.name}.`,
                ogImage: guildInfo.icon || 'https://cdn.discordapp.com/embed/avatars/0.png',
                generatedAt: new Date().toISOString(),
                type
            };

            let data;
            if (type === 'xp') data = xpLeaderboard;
            else if (type === 'economy') data = economyLeaderboard;
            else data = { xp: xpLeaderboard, economy: economyLeaderboard };

            res.json({
                success: true,
                guild: guildInfo,
                meta,
                data
            });
        } catch (error) {
            logger.error(`Erreur GET /api/leaderboard/public: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    };

    router.get('/public', handleLeaderboard);
    router.get('/', handleLeaderboard);

    return router;
}

module.exports = createLeaderboardRouter;
