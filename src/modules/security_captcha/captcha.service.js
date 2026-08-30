const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { CaptchaRepository } = require('./captcha.repository.js');
const { config, getConfig } = require('../../config/index.js');
const { sendCaptchaLog } = require('./captcha-logger.js');
const DiscordCacheService = require('../../services/discordCacheService.js');
const logger = require('../../utils/logger.js');

class CaptchaService {
    static inject = [CaptchaRepository];

    constructor(repository) {
        this.repo = repository;
    }

    getConfig() {
        const currentConfig = getConfig ? getConfig() : config;
        return currentConfig.captcha || {};
    }

    numberToFrench(num) {
        const numbers = {
            1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq',
            6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix',
            11: 'onze', 12: 'douze', 13: 'treize', 14: 'quatorze', 15: 'quinze',
            16: 'seize', 17: 'dix-sept', 18: 'dix-huit', 19: 'dix-neuf', 20: 'vingt'
        };
        return numbers[num] || num.toString();
    }

    generateMathQuestion() {
        const captchaConfig = this.getConfig();
        const minNum = captchaConfig.min_number || 1;
        const maxNum = captchaConfig.max_number || 20;

        const operations = ['+', '-', '*'];
        const weights = { '+': 0.5, '-': 0.3, '*': 0.2 };

        const weightedOperations = [];
        for (const op of operations) {
            const count = Math.floor((weights[op] || 0.3) * 100);
            for (let i = 0; i < count; i++) {
                weightedOperations.push(op);
            }
        }

        const operator = weightedOperations[Math.floor(Math.random() * weightedOperations.length)] || '+';

        let num1, num2, answer;
        switch (operator) {
            case '+':
                num1 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
                num2 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
                answer = num1 + num2;
                break;
            case '-':
                num1 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
                num2 = Math.floor(Math.random() * (num1 - minNum + 1)) + minNum;
                answer = num1 - num2;
                break;
            case '*':
                num1 = Math.floor(Math.random() * (Math.min(maxNum, 10) - minNum + 1)) + minNum;
                num2 = Math.floor(Math.random() * (Math.min(maxNum, 10) - minNum + 1)) + minNum;
                answer = num1 * num2;
                break;
            default:
                num1 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
                num2 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
                answer = num1 + num2;
        }

        const num1Str = this.numberToFrench(num1);
        const num2Str = this.numberToFrench(num2);

        const question = `Combien font ${num1Str} ${operator} ${num2Str} ?`;

        return {
            question,
            answer: answer.toString(),
            num1: num1Str,
            num2: num2Str,
            operator
        };
    }

    async getVerifiedRole(guild) {
        const captchaConfig = this.getConfig();
        const roleId = captchaConfig.verified_role_id || process.env.VERIFIED_ROLE_ID;
        if (!roleId) return null;

        try {
            return await guild.roles.fetch(roleId);
        } catch (error) {
            console.error(`❌ [Captcha] Rôle vérifié (ID: ${roleId}) introuvable:`, error);
            return null;
        }
    }

    async createUserCaptchaChannel(member) {
        const adminRoles = member.guild.roles.cache.filter(role => role.permissions.has('Administrator'));

        const permissionOverwrites = [
            {
                id: member.guild.roles.everyone.id,
                deny: ['ViewChannel']
            },
            {
                id: member.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
            }
        ];

        adminRoles.forEach(adminRole => {
            permissionOverwrites.push({
                id: adminRole.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages']
            });
        });

        try {
            const channel = await member.guild.channels.create({
                name: `captcha-${member.user.username.toLowerCase()}`,
                type: 0,
                topic: `Canal de vérification pour ${member.user.tag}`,
                permissionOverwrites
            });

            return channel;
        } catch (error) {
            console.error('❌ [Captcha] Erreur création canal:', error);
            throw error;
        }
    }

    async triggerWelcome(member) {
        try {
            const { container } = require('../../core/container.js');
            const { WelcomeService } = require('../welcome_welcome/welcome.service.js');
            const welcomeService = container.resolve(WelcomeService);
            await welcomeService.handleWelcome(member);
        } catch (err) {
            console.error('❌ [Captcha] Erreur déclenchement accueil:', err);
        }
    }

    /**
     * Traite l'arrivée d'un nouveau membre
     */
    async handleMemberJoin(member) {
        if (member.user.bot) return;

        const captchaConfig = this.getConfig();
        if (captchaConfig.enabled === false) {
            console.log(`ℹ️ [Captcha] Captcha désactivé - ${member.user.tag} rejoint sans vérification`);
            await this.triggerWelcome(member);
            return;
        }

        try {
            const existing = await this.repo.getUserCaptcha(member.id, member.guild.id);
            if (existing && existing.is_verified) {
                const role = await this.getVerifiedRole(member.guild);
                if (role) {
                    await member.roles.add(role.id).catch(err => {
                        console.warn('[Captcha] Impossible d\'ajouter le rôle vérifié:', err.message);
                    });
                }
                await sendCaptchaLog(member.guild, 'Déjà vérifié', `**${member.user.tag}** est déjà vérifié sur le serveur. Rôle appliqué directement.`, '#3498db', {
                    member,
                    role
                });
                await this.triggerWelcome(member);
                return;
            }

            const channel = await this.createUserCaptchaChannel(member);
            const mathQuestion = this.generateMathQuestion();
            const timeoutMinutes = captchaConfig.timeout_minutes || 10;

            await this.repo.createCaptcha(
                member.id,
                member.user.username,
                member.guild.id,
                mathQuestion.question,
                mathQuestion.answer,
                channel.id,
                timeoutMinutes
            );

            await sendCaptchaLog(member.guild, 'Création canal', `Canal temporaire de vérification créé pour **${member.user.tag}**`, '#5865F2', {
                member,
                channel,
                question: mathQuestion.question,
                timeoutMinutes,
                maxAttempts: captchaConfig.max_attempts || 3
            });

            const welcomeMsg = captchaConfig.messages?.welcome_message || "Bienvenue sur le serveur ! Pour des raisons de sécurité, veuillez résoudre ce calcul :";
            const instructions = captchaConfig.messages?.instructions || "Répondez avec le nombre en chiffres uniquement (exemple: 12) dans les 10 minutes.";

            const content = `${member.user}, ${welcomeMsg}\n\n**${mathQuestion.question}**\n\n${instructions}`;
            const sentMsg = await channel.send(content);
            if (sentMsg) {
                try {
                    await DiscordCacheService.cacheDiscordMessage(sentMsg);
                } catch (err) {
                    console.debug('[Captcha] Erreur mise en cache message envoyé:', err.message);
                }
            }

            console.log(`🔒 [Captcha] Captcha envoyé à ${member.user.tag} dans ${channel.name} : "${mathQuestion.question}" (Réponse: ${mathQuestion.answer})`);

        } catch (error) {
            console.error('❌ [Captcha] Erreur handleMemberJoin:', error);
        }
    }

    /**
     * Traite les réponses envoyées dans le salon captcha
     */
    async handleIncomingMessage(message) {
        if (message.author.bot) return false;

        const isCaptchaChannel = message.channel.name?.includes('captcha') ||
            message.channel.name?.includes('verification') ||
            message.channel.topic?.includes('vérification') ||
            message.channel.topic?.includes('captcha');

        if (!isCaptchaChannel) return false;

        // Cacher le message de l'utilisateur pour l'historique
        try {
            await DiscordCacheService.cacheDiscordMessage(message);
        } catch (err) {
            console.debug('[Captcha] Cache incoming message failed:', err.message);
        }

        try {
            const captcha = await this.repo.getUserCaptcha(message.author.id, message.guild?.id);
            if (!captcha) return false;

            if (captcha.is_verified) {
                const rep = await message.reply("Vous êtes déjà vérifié !");
                if (rep) {
                    try { await DiscordCacheService.cacheDiscordMessage(rep); } catch (err) { console.debug('[Captcha] Cache reply failed:', err.message); }
                }
                return true;
            }

            // Vérifier expiration
            if (captcha.expires_at && new Date() > new Date(captcha.expires_at)) {
                const rep = await message.reply("❌ Le temps imparti pour répondre au captcha a expiré.");
                if (rep) {
                    try { await DiscordCacheService.cacheDiscordMessage(rep); } catch (err) { console.debug('[Captcha] Cache reply failed:', err.message); }
                }
                return true;
            }

            const userAnswer = message.content.trim();
            const maxAttempts = this.getConfig().max_attempts || 3;

            // Vérification réponse
            if (userAnswer === captcha.answer) {
                // ✅ Succès
                await this.repo.markVerified(message.author.id, message.guild.id);
                const rep = await message.reply("✅ Bravo ! Vous avez validé le captcha avec succès.");
                if (rep) {
                    try { await DiscordCacheService.cacheDiscordMessage(rep); } catch (err) { console.debug('[Captcha] Cache reply failed:', err.message); }
                }

                const role = await this.getVerifiedRole(message.guild);
                if (role && message.member) {
                    await message.member.roles.add(role.id).catch(err => {
                        console.warn('[Captcha] Impossible d\'ajouter le rôle vérifié:', err.message);
                    });
                }

                await sendCaptchaLog(message.guild, 'Succès captcha', `**${message.author.tag}** a résolu le captcha avec succès et a reçu le rôle vérifié.`, '#2ecc71', {
                    member: message.member,
                    user: message.author,
                    channel: message.channel,
                    question: captcha.question,
                    userAnswer,
                    attempts: (captcha.attempts || 0) + 1,
                    maxAttempts,
                    role
                });

                if (message.member) {
                    await this.triggerWelcome(message.member);
                }

                setTimeout(async () => {
                    await message.channel.delete().catch(err => {
                        console.warn('[Captcha] Impossible de supprimer le salon captcha:', err.message);
                    });
                }, 3000);

                console.log(`✅ [Captcha] ${message.author.tag} a validé son captcha !`);
                return true;

            } else {
                // ❌ Échec
                const nextAttempts = (captcha.attempts || 0) + 1;
                await this.repo.updateAttempts(message.author.id, message.guild.id, nextAttempts);

                if (nextAttempts >= maxAttempts) {
                    const rep = await message.reply("❌ Trop de tentatives infructueuses. Vous allez être expulsé du serveur.");
                    if (rep) {
                        try { await DiscordCacheService.cacheDiscordMessage(rep); } catch (err) { console.debug('[Captcha] Cache reply failed:', err.message); }
                    }
                    if (message.member) {
                        await message.member.kick('Échec vérification captcha').catch(err => {
                            console.warn('[Captcha] Impossible de kick le membre:', err.message);
                        });
                    }
                    await sendCaptchaLog(message.guild, 'Kick utilisateur', `**${message.author.tag}** a été expulsé du serveur suite au dépassement du nombre maximal de tentatives (**${nextAttempts}/${maxAttempts}**).`, '#e74c3c', {
                        member: message.member,
                        user: message.author,
                        channel: message.channel,
                        question: captcha.question,
                        userAnswer,
                        attempts: nextAttempts,
                        maxAttempts,
                        reason: 'Nombre maximal de tentatives dépassé'
                    });

                    setTimeout(async () => {
                        await message.channel.delete().catch(err => {
                            console.warn('[Captcha] Impossible de supprimer le salon captcha:', err.message);
                        });
                    }, 3000);

                    console.log(`🚫 [Captcha] ${message.author.tag} a dépassé les tentatives max et a été expulsé.`);
                    return true;
                }

                const remaining = maxAttempts - nextAttempts;
                const rep = await message.reply(`❌ Réponse incorrecte. Il vous reste **${remaining}** tentative(s).`);
                if (rep) {
                    try { await DiscordCacheService.cacheDiscordMessage(rep); } catch (err) { console.debug('[Captcha] Cache reply failed:', err.message); }
                }
                await sendCaptchaLog(message.guild, 'Tentative échouée', `**${message.author.tag}** a soumis une réponse incorrecte (\`${userAnswer}\`). Il lui reste **${remaining}** tentative(s).`, '#f39c12', {
                    member: message.member,
                    user: message.author,
                    channel: message.channel,
                    question: captcha.question,
                    userAnswer,
                    attempts: nextAttempts,
                    maxAttempts,
                    remaining
                });
                return true;
            }

        } catch (error) {
            console.error('❌ [Captcha] Erreur handleIncomingMessage:', error);
            return false;
        }
    }

    /**
     * Récupère l'historique et les statistiques pour le Dashboard
     */
    async getCaptchaOverview() {
        const rawCaptchas = await this.repo.getAllCaptchas(100);
        const captchaConfig = this.getConfig();
        const maxAttempts = captchaConfig.max_attempts || 3;

        const captchas = rawCaptchas.map(c => {
            const isExpired = c.expires_at ? new Date() > new Date(c.expires_at) : false;
            let status = 'pending';
            if (c.is_verified === 1) status = 'verified';
            else if (c.attempts >= maxAttempts) status = 'failed';
            else if (isExpired) status = 'expired';

            return {
                id: `${c.user_id}_${c.guild_id}`,
                userId: c.user_id,
                username: c.username || `Utilisateur ${c.user_id}`,
                question: c.question,
                answer: c.answer,
                attempts: c.attempts || 0,
                maxAttempts,
                status,
                isVerified: c.is_verified === 1,
                channelId: c.channel_id,
                channelName: c.channel_name || (c.username ? `captcha-${c.username.toLowerCase()}` : `captcha-${c.user_id}`),
                channelDeletedAt: c.channel_deleted_at || null,
                isChannelDeleted: !!c.channel_deleted_at,
                createdAt: c.created_at,
                expiresAt: c.expires_at,
                verifiedAt: c.verified_at
            };
        });

        const memoryLogs = logger.getMemoryLogs ? logger.getMemoryLogs(100) : [];
        const captchaLogs = memoryLogs.filter(l =>
            l.tag === 'CAPTCHA' ||
            (l.message && (l.message.toLowerCase().includes('captcha') || l.message.toLowerCase().includes('sécurité') || l.message.toLowerCase().includes('vérif')))
        );

        const total = captchas.length;
        const verifiedCount = captchas.filter(c => c.status === 'verified').length;
        const pendingCount = captchas.filter(c => c.status === 'pending').length;
        const failedCount = captchas.filter(c => c.status === 'failed' || c.status === 'expired').length;

        return {
            stats: {
                total,
                verifiedCount,
                pendingCount,
                failedCount,
                successRate: total > 0 ? Math.round((verifiedCount / total) * 100) : 100
            },
            config: {
                isEnabled: captchaConfig.enabled !== false,
                timeoutMinutes: captchaConfig.timeout_minutes || 10,
                maxAttempts,
                verifiedRoleId: captchaConfig.verified_role_id || null,
                channelId: captchaConfig.channel_id || null
            },
            captchas,
            logs: captchaLogs
        };
    }

    /**
     * Récupère l'historique complet des messages et détails d'un salon Captcha
     */
    async getChannelHistory(channelId, userId = null, guildId = null) {
        return await this.repo.getCaptchaChannelDetails(channelId, userId);
    }

    // =================== BORDERWALL & ANTI-RAID ===================

    _getJoinHistory(guildId) {
        if (!this._joinHistories) this._joinHistories = new Map();
        if (!this._joinHistories.has(guildId)) this._joinHistories.set(guildId, []);
        return this._joinHistories.get(guildId);
    }

    recordJoinAndCheckRaid(guildId, threshold = 5, windowSeconds = 10) {
        const now = Date.now();
        const history = this._getJoinHistory(guildId);
        history.push(now);

        const cutoff = now - (windowSeconds * 1000);
        const validJoins = history.filter(t => t >= cutoff);
        this._joinHistories.set(guildId, validJoins);

        return validJoins.length >= threshold;
    }

    async getBorderwallConfig(guildId) {
        const { db } = require('../../db/index.js');
        try {
            const res = await db.pool.query(
                `SELECT * FROM borderwall_configs WHERE guild_id = $1 LIMIT 1`,
                [guildId]
            );
            return res.rows?.[0] ? {
                enabled: res.rows[0].enabled === 1,
                raidThreshold: Number(res.rows[0].raid_threshold || 5),
                raidWindowSeconds: Number(res.rows[0].raid_window_seconds || 10),
                quarantineRoleId: res.rows[0].quarantine_role_id,
                logChannelId: res.rows[0].log_channel_id,
                timeoutMinutes: Number(res.rows[0].timeout_minutes || 10)
            } : {
                enabled: false,
                raidThreshold: 5,
                raidWindowSeconds: 10,
                quarantineRoleId: null,
                logChannelId: null,
                timeoutMinutes: 10
            };
        } catch {
            return { enabled: false, raidThreshold: 5, raidWindowSeconds: 10, quarantineRoleId: null, timeoutMinutes: 10 };
        }
    }

    async setBorderwallConfig(guildId, { enabled, raidThreshold = 5, raidWindowSeconds = 10, quarantineRoleId = null, logChannelId = null, timeoutMinutes = 10 }) {
        const { db } = require('../../db/index.js');
        const crypto = require('crypto');
        const id = crypto.randomUUID();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO borderwall_configs (id, guild_id, enabled, raid_threshold, raid_window_seconds, quarantine_role_id, log_channel_id, timeout_minutes, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
             ON CONFLICT (guild_id) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                raid_threshold = EXCLUDED.raid_threshold,
                raid_window_seconds = EXCLUDED.raid_window_seconds,
                quarantine_role_id = EXCLUDED.quarantine_role_id,
                log_channel_id = EXCLUDED.log_channel_id,
                timeout_minutes = EXCLUDED.timeout_minutes,
                updated_at = EXCLUDED.updated_at`,
            [id, guildId, enabled ? 1 : 0, raidThreshold, raidWindowSeconds, quarantineRoleId, logChannelId, timeoutMinutes, now]
        );

        return this.getBorderwallConfig(guildId);
    }
}

Injectable()(CaptchaService);

module.exports = {
    CaptchaService
};

