const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { XPLevelRepository } = require('./xp-level.repository.js');
const { LevelUpService } = require('./level-up.service.js');
const { config, getConfig } = require('../../config/index.js');

class XPLevelService {
    static inject = [XPLevelRepository, LevelUpService];

    constructor(repository, levelUp) {
        this.repo = repository;
        this.levelUp = levelUp;
    }

    getConfig() {
        const currentConfig = getConfig ? getConfig() : config;
        return currentConfig.xp || {};
    }

    isXPEnabled() {
        const conf = this.getConfig();
        return conf.enabled === true;
    }

    /**
     * Formule de niveau : Niveau = floor(sqrt(XP / 100))
     */
    calculateLevel(totalXp) {
        if (!totalXp || totalXp <= 0) return 0;
        return Math.floor(Math.sqrt(totalXp / 100));
    }

    /**
     * Total d'XP requis pour atteindre un niveau donné : 100 * Niveau^2
     */
    calculateTotalXPForLevel(level) {
        if (!level || level <= 0) return 0;
        return 100 * Math.pow(level, 2);
    }

    /**
     * Calcule la progression d'un utilisateur vers le niveau suivant
     */
    getXPProgress(totalXp) {
        const currentLevel = this.calculateLevel(totalXp);
        const currentLevelBaseXP = this.calculateTotalXPForLevel(currentLevel);
        const nextLevelTotalXP = this.calculateTotalXPForLevel(currentLevel + 1);

        const xpInCurrentLevel = totalXp - currentLevelBaseXP;
        const xpNeededForNext = nextLevelTotalXP - currentLevelBaseXP;
        const progressPercent = xpNeededForNext > 0 ? Math.min(100, Math.floor((xpInCurrentLevel / xpNeededForNext) * 100)) : 100;

        return {
            currentLevel,
            totalXp,
            xpInCurrentLevel,
            xpNeededForNext,
            progressPercent,
            nextLevelTotalXP
        };
    }

    /**
     * Ajoute de l'XP à un utilisateur et gère les montées de niveau
     */
    async addXP(userId, username, amount, type = 'message', description = 'Gain XP', metadata = {}) {
        const conf = this.getConfig();
        if (conf.enabled === false) return { success: false, reason: 'disabled' };

        const user = await this.repo.getOrCreateUserXP(userId, username);
        const oldLevel = user.level || this.calculateLevel(user.total_xp || 0);
        const newTotalXP = (user.total_xp || 0) + amount;
        const newLevel = this.calculateLevel(newTotalXP);

        await this.repo.updateUserXP(userId, username, newTotalXP, newLevel, type === 'message');
        await this.repo.logTransaction(userId, username, amount, type, description, metadata);

        const leveledUp = newLevel > oldLevel;
        if (leveledUp) {
            console.log(`🎉 [XP] ${username} est monté au NIVEAU ${newLevel} ! (${newTotalXP} XP total)`);
        }

        return {
            success: true,
            userId,
            username,
            xpAdded: amount,
            totalXp: newTotalXP,
            oldLevel,
            newLevel,
            leveledUp
        };
    }

    /**
     * Calcule le rang actuel d'un utilisateur dans le leaderboard
     */
    async getUserRank(userId) {
        const leaderboard = await this.repo.getLeaderboard(10000);
        const idx = leaderboard.findIndex(u => u.userId === userId);
        return idx >= 0 ? idx + 1 : null;
    }

    /**
     * Déclenche l'annonce de level-up + attribution des rôles
     * Centralisé pour réutilisation par les events et les commandes admin
     */
    async triggerLevelUp(guild, user, member, newLevel) {
        const conf = this.getConfig();
        const levelUpConf = conf.level_up || conf.LEVEL_UP || {};
        this.levelUp.setConfig(levelUpConf);
        const rank = await this.getUserRank(user.id);
        const totalXp = (await this.repo.getUserXP(user.id))?.xp || 0;

        if (this.levelUp.isEnabled()) {
            await this.levelUp.announce(guild, user, member, { level: newLevel, totalXp, rank });
        }

        const levelRoles = conf.level_roles || conf.LEVEL_ROLES || {};
        if (Object.keys(levelRoles).length > 0) {
            const options = { cumulable: conf.level_roles_cumulable === true };
            await this.levelUp.applyRewardRoles(guild, member, newLevel, levelRoles, options);
        }
    }

    /**
     * Traite un message pour accorder de l'XP aléatoire
     */
    async handleMessageXP(message) {
        const conf = this.getConfig();
        if (conf.enabled === false) return;
        if (message.author.bot || !message.guild) return;

        const user = await this.repo.getOrCreateUserXP(message.author.id, message.author.username);

        // Cooldown de message (par défaut 60s)
        const cooldownSeconds = conf.cooldown || conf.cooldown_seconds || 60;
        if (user.last_message_xp) {
            const lastTime = new Date(user.last_message_xp).getTime();
            const now = Date.now();
            if ((now - lastTime) / 1000 < cooldownSeconds) {
                return;
            }
        }

        const minXP = conf.message_xp?.min || 15;
        const maxXP = conf.message_xp?.max || 25;
        const xpAmount = Math.floor(Math.random() * (maxXP - minXP + 1)) + minXP;

        const result = await this.addXP(message.author.id, message.author.username, xpAmount, 'message', 'Message dans le chat');

        if (result.leveledUp) {
            await this.triggerLevelUp(message.guild, message.author, message.member, result.newLevel);
        }
    }

    /**
     * Traite les changements d'état vocal
     */
    async handleVoiceStateUpdate(oldState, newState) {
        const conf = this.getConfig();
        if (conf.enabled === false) return;

        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const userId = member.id;
        const username = member.user.username;

        if (!oldState.channelId && newState.channelId) {
            await this.repo.startVoiceSession(userId, username, newState.channelId, newState.channel?.name || 'Vocal');
            return;
        }

        if (oldState.channelId && !newState.channelId) {
            const session = await this.repo.endVoiceSession(userId);
            if (session && session.durationMinutes >= 1) {
                const xpPerMin = conf.voice_xp?.per_minute || 5;
                const earned = session.durationMinutes * xpPerMin;
                const res = await this.addXP(userId, username, earned, 'voice', `Session vocale de ${session.durationMinutes} min`);
                if (res.leveledUp && oldState.guild) {
                    await this.triggerLevelUp(oldState.guild, member.user, member, res.newLevel);
                }
            }
        }
    }

    /**
     * Récupère le profil complet d'un utilisateur
     */
    async getUserProfile(userId, username = null) {
        const user = await this.repo.getUserXP(userId);
        const totalXp = user?.total_xp || 0;
        const progress = this.getXPProgress(totalXp);
        const rank = await this.getUserRank(userId);

        return {
            userId,
            username: user?.username || username || `Utilisateur ${userId}`,
            totalXp,
            level: progress.currentLevel,
            rank: rank || '?',
            messagesCount: user?.messages_count || user?.messagesCount || 0,
            voiceMinutes: user?.voice_minutes || user?.voiceMinutes || 0,
            progress
        };
    }

    async getLeaderboard(limit = 20, offset = 0) {
        const all = await this.repo.getLeaderboard(offset + limit);
        return {
            entries: all.slice(offset, offset + limit),
            total: all.length
        };
    }
}

Injectable()(XPLevelService);

module.exports = {
    XPLevelService
};
