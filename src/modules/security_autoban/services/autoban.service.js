/**
 * src/modules/security_autoban/services/autoban.service.js
 *
 * Service d'analyse et de sanction automatique des nouveaux membres (Phase 11 G17).
 */

const { Injectable } = require('../../../core/index.js');
const { AutobanRepository } = require('./autoban.repository.js');
const logger = require('../../../utils/logger.js');

class AutobanService {
    static inject = [AutobanRepository];

    constructor(repo) {
        this.repo = repo;
    }

    evaluateMember(member, config) {
        if (!member || !member.user || !config || config.enabled === false) {
            return { matched: false };
        }

        const user = member.user;
        const now = Date.now();
        const createdTimestamp = user.createdTimestamp || (user.createdAt ? user.createdAt.getTime() : now);
        const ageHours = (now - createdTimestamp) / (1000 * 3600);

        // 1. Âge minimal du compte
        if (config.min_account_age_hours && config.min_account_age_hours > 0) {
            if (ageHours < config.min_account_age_hours) {
                return {
                    matched: true,
                    reason: `Compte trop récent (${Math.round(ageHours * 10) / 10}h < ${config.min_account_age_hours}h)`,
                    action: config.action || 'ban'
                };
            }
        }

        // 2. Avatar par défaut
        if (config.block_default_avatar) {
            if (!user.avatar) {
                return {
                    matched: true,
                    reason: `Avatar Discord par défaut interdit`,
                    action: config.action || 'ban'
                };
            }
        }

        // 3. Regex sur le pseudo
        if (Array.isArray(config.username_blacklist_regex) && config.username_blacklist_regex.length > 0) {
            const username = user.username || '';
            const displayName = member.displayName || '';
            for (const pattern of config.username_blacklist_regex) {
                try {
                    const re = new RegExp(pattern, 'i');
                    if (re.test(username) || re.test(displayName)) {
                        return {
                            matched: true,
                            reason: `Pseudo suspect correspondant au filtre "${pattern}"`,
                            action: config.action || 'ban'
                        };
                    }
                } catch (_) {}
            }
        }

        return { matched: false };
    }

    async processNewMember(member, config) {
        const evaluation = this.evaluateMember(member, config);
        if (!evaluation.matched) return { acted: false };

        const { reason, action } = evaluation;
        const guild = member.guild;
        const user = member.user;

        logger.warn(`[AUTOBAN] Sanction "${action}" appliquée à ${user.tag} (${user.id}) sur ${guild.name} pour: ${reason}`, 'AUTOBAN');

        try {
            if (action === 'ban') {
                if (guild.members?.ban) {
                    await guild.members.ban(user.id, { reason: `[Autoban] ${reason}` }).catch(err => {
                        logger.error(`Erreur autoban ban: ${err.message}`, 'AUTOBAN');
                    });
                }
            } else if (action === 'kick') {
                if (member.kick) {
                    await member.kick(`[Autoban] ${reason}`).catch(err => {
                        logger.error(`Erreur autoban kick: ${err.message}`, 'AUTOBAN');
                    });
                }
            } else if (action === 'quarantine' && config.quarantine_role_id) {
                if (member.roles?.add) {
                    await member.roles.add(config.quarantine_role_id, `[Autoban] ${reason}`).catch(() => {});
                }
            }

            await this.repo.logAction({
                guildId: guild.id,
                userId: user.id,
                userTag: user.tag || user.username,
                reason,
                action
            });

            return { acted: true, action, reason };
        } catch (err) {
            logger.error(`Erreur execution autoban: ${err.message}`, 'AUTOBAN');
            return { acted: false, error: err.message };
        }
    }

    async listLogs(guildId, limit = 50) {
        return this.repo.listLogs(guildId, limit);
    }
}

Injectable()(AutobanService);

module.exports = { AutobanService };
