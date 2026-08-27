const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { XPLevelRepository } = require('./xp-level.repository.js');
const { config, getConfig } = require('../../config/index.js');

class XPLevelService {
    static inject = [XPLevelRepository];

    constructor(repository) {
        this.repo = repository;
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
            await this.notifyLevelUp(message.channel, message.member, result.newLevel);
            await this.checkAndAssignRewardRoles(message.guild, message.member, result.newLevel);
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

        // Connexion à un salon vocal (non afk)
        if (!oldState.channelId && newState.channelId) {
            await this.repo.startVoiceSession(userId, username, newState.channelId, newState.channel?.name || 'Vocal');
            return;
        }

        // Déconnexion d'un salon vocal
        if (oldState.channelId && !newState.channelId) {
            const session = await this.repo.endVoiceSession(userId);
            if (session && session.durationMinutes >= 1) {
                const xpPerMin = conf.voice_xp?.per_minute || 5;
                const earned = session.durationMinutes * xpPerMin;
                const res = await this.addXP(userId, username, earned, 'voice', `Session vocale de ${session.durationMinutes} min`);
                if (res.leveledUp && oldState.guild) {
                    await this.checkAndAssignRewardRoles(oldState.guild, member, res.newLevel);
                }
            }
        }
    }

    /**
     * Envoie une annonce de level up
     */
    async notifyLevelUp(channel, member, newLevel) {
        if (!channel || !member) return;

        try {
            const embed = new EmbedBuilder()
                .setColor('#f2c7ce')
                .setTitle('🎉 NIVEAU SUPÉRIEUR !')
                .setDescription(`Félicitations <@${member.id}> ! Vous venez d'atteindre le **Niveau ${newLevel}** ! 🚀`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('❌ [XP] Erreur envoi embed level up:', err.message);
        }
    }

    /**
     * Attribue les rôles de récompense selon le niveau atteint
     */
    async checkAndAssignRewardRoles(guild, member, level) {
        if (!guild || !member) return;
        const conf = this.getConfig();
        if (conf.enabled === false) return;

        try {
            if (typeof this.repo.getRewardRoles !== 'function') return;
            const rewardRoles = await this.repo.getRewardRoles(guild.id);
            if (!Array.isArray(rewardRoles)) return;

            for (const r of rewardRoles) {
                if (r.levelRequired <= level) {
                    let role = guild.roles.cache.get(r.roleId);
                    if (!role) {
                        role = guild.roles.cache.find(roleObj => roleObj.name.toLowerCase() === String(r.roleId).toLowerCase());
                    }
                    if (role && !member.roles.cache.has(role.id)) {
                        await member.roles.add(role.id).catch(err => {
                            console.warn(`⚠️ [XP] Impossible d'ajouter le rôle "${role.name}" à ${member.user.tag}: ${err.message}`);
                        });
                        console.log(`🎖️ [XP] Rôle "${role.name}" attribué à ${member.user.tag} pour le niveau ${r.levelRequired}`);
                    }
                }
            }
        } catch (err) {
            console.error('❌ [XP] Erreur attribution rôle reward:', err.message);
        }
    }

    /**
     * Récupère le profil complet d'un utilisateur
     */
    async getUserProfile(userId, username = null) {
        const user = await this.repo.getUserXP(userId);
        const totalXp = user?.total_xp || 0;
        const progress = this.getXPProgress(totalXp);
        const leaderboard = await this.repo.getLeaderboard(1000);
        const rankIndex = leaderboard.findIndex(u => u.userId === userId);
        const rank = rankIndex >= 0 ? rankIndex + 1 : leaderboard.length + 1;

        return {
            userId,
            username: user?.username || username || `Utilisateur ${userId}`,
            totalXp,
            level: progress.currentLevel,
            rank,
            messagesCount: user?.messages_count || user?.messagesCount || 0,
            voiceMinutes: user?.voice_minutes || user?.voiceMinutes || 0,
            progress
        };
    }

    async getLeaderboard(limit = 20) {
        return await this.repo.getLeaderboard(limit);
    }
}

Injectable()(XPLevelService);

module.exports = {
    XPLevelService
};
