/**
 * src/modules/community_timed_roles/services/timed-roles.service.js
 *
 * Service métier pour la gestion des rôles temporaires (Phase 10 G07).
 */

const { Injectable, getConfig } = require('../../../core/index.js');
const { TimedRolesRepository } = require('./timed-roles.repository.js');
const logger = require('../../../utils/logger.js');

class TimedRolesService {
    static inject = [TimedRolesRepository];

    constructor(repo) {
        this.repo = repo;
        this._intervalTimer = null;
    }

    parseDuration(str) {
        if (!str || typeof str !== 'string') return null;
        const match = str.trim().match(/^(\d+)\s*(s|sec|m|min|h|hour|d|day|w|week)?$/i);
        if (!match) return null;

        const val = parseInt(match[1], 10);
        const unit = (match[2] || 'm').toLowerCase();

        switch (unit) {
            case 's':
            case 'sec':
                return val;
            case 'm':
            case 'min':
                return val * 60;
            case 'h':
            case 'hour':
                return val * 3600;
            case 'd':
            case 'day':
                return val * 86400;
            case 'w':
            case 'week':
                return val * 604800;
            default:
                return val * 60;
        }
    }

    async addTimedRole(member, roleId, durationSeconds) {
        if (!member || !member.guild || !roleId || !durationSeconds) {
            return { ok: false, error: 'Paramètres invalides' };
        }

        const guildId = member.guild.id;
        const userId = member.id;
        const expiresAt = Date.now() + (durationSeconds * 1000);

        try {
            if (member.roles && member.roles.add) {
                await member.roles.add(roleId).catch(err => {
                    throw new Error(`Impossible d'ajouter le rôle au membre : ${err.message}`);
                });
            }

            // Supprimer une entrée existante si déjà présent
            await this.repo.deleteByRole(guildId, userId, roleId);

            const record = await this.repo.insertTimedRole({
                guildId,
                userId,
                roleId,
                expiresAt
            });

            logger.info(`Rôle temporaire ${roleId} attribué à ${userId} sur ${guildId} jusqu'à ${new Date(expiresAt).toISOString()}`, 'TIMED_ROLES');
            return { ok: true, data: record };
        } catch (err) {
            logger.warn(`Erreur addTimedRole: ${err.message}`, 'TIMED_ROLES');
            return { ok: false, error: err.message };
        }
    }

    async removeTimedRole(guildId, userId, roleId, member = null) {
        try {
            await this.repo.deleteByRole(guildId, userId, roleId);
            if (member?.roles?.remove) {
                await member.roles.remove(roleId).catch(() => { });
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    async listUserTimedRoles(guildId, userId) {
        return this.repo.listByUser(guildId, userId);
    }

    async listGuildTimedRoles(guildId) {
        return this.repo.listByGuild(guildId);
    }

    async checkAndRemoveExpired(client) {
        try {
            const now = Date.now();
            const expired = await this.repo.listExpired(now);

            for (const item of expired) {
                try {
                    if (client && client.guilds) {
                        const guild = client.guilds.cache.get(item.guildId) || await client.guilds.fetch(item.guildId).catch(() => null);
                        if (guild) {
                            const member = guild.members.cache.get(item.userId) || await guild.members.fetch(item.userId).catch(() => null);
                            if (member && member.roles.cache.has(item.roleId)) {
                                await member.roles.remove(item.roleId, 'Expiration du rôle temporaire').catch(() => { });
                                logger.info(`Rôle temporaire ${item.roleId} retiré avec succès de ${item.userId} sur ${guild.name}`, 'TIMED_ROLES');
                            }
                        }
                    }
                } catch (err) {
                    logger.warn(`Erreur retrait rôle expiré pour ${item.userId}: ${err.message}`, 'TIMED_ROLES');
                } finally {
                    await this.repo.delete(item.id);
                }
            }
        } catch (err) {
            logger.warn(`Erreur checkAndRemoveExpired: ${err.message}`, 'TIMED_ROLES');
        }
    }

    start(client) {
        if (this._intervalTimer) return;
        this._intervalTimer = setInterval(() => {
            this.checkAndRemoveExpired(client).catch(() => { });
        }, 30000);
    }

    stop() {
        if (this._intervalTimer) {
            clearInterval(this._intervalTimer);
            this._intervalTimer = null;
        }
    }
}

Injectable()(TimedRolesService);

module.exports = { TimedRolesService };
