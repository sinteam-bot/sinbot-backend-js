const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { SecurityQuestionRepository } = require('./security-question.repository.js');
const { config, getConfig } = require('../../config/index.js');
const { sendCaptchaLog } = require('./captcha-logger.js');
const logger = require('../../utils/logger.js');

class SecurityQuestionService {
    static inject = [SecurityQuestionRepository];

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
            console.error(`❌ [SecurityQuestion] Rôle vérifié (ID: ${roleId}) introuvable:`, error);
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

            await sendCaptchaLog(member.guild, 'Création canal', `Canal captcha créé pour **${member.user.tag}** (ID: ${channel.id})`, '#3498db');
            return channel;
        } catch (error) {
            console.error('❌ [SecurityQuestion] Erreur création canal:', error);
            throw error;
        }
    }

    async triggerWelcome(member) {
        try {
            const { container } = require('../../core/container.js');
            const { WelcomeService } = require('../feature_welcome/welcome.service.js');
            const welcomeService = container.resolve(WelcomeService);
            await welcomeService.handleWelcome(member);
        } catch (err) {
            console.error('❌ [SecurityQuestion] Erreur déclenchement accueil:', err);
        }
    }

    /**
     * Traite l'arrivée d'un nouveau membre
     */
    async handleMemberJoin(member) {
        if (member.user.bot) return;

        const captchaConfig = this.getConfig();
        if (captchaConfig.enabled === false) {
            console.log(`ℹ️ [SecurityQuestion] Captcha désactivé - ${member.user.tag} rejoint sans vérification`);
            await this.triggerWelcome(member);
            return;
        }

        try {
            const existing = await this.repo.getUserCaptcha(member.id, member.guild.id);
            if (existing && existing.is_verified) {
                await sendCaptchaLog(member.guild, 'Déjà vérifié', `**${member.user.tag}** est déjà vérifié`, '#3498db');
                const role = await this.getVerifiedRole(member.guild);
                if (role) {
                    await member.roles.add(role.id).catch(() => {});
                }
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

            const welcomeMsg = captchaConfig.messages?.welcome_message || "Bienvenue sur le serveur ! Pour des raisons de sécurité, veuillez résoudre ce calcul :";
            const instructions = captchaConfig.messages?.instructions || "Répondez avec le nombre en chiffres uniquement (exemple: 12) dans les 10 minutes.";

            const content = `${member.user}, ${welcomeMsg}\n\n**${mathQuestion.question}**\n\n${instructions}`;
            await channel.send(content);

            console.log(`🔒 [SecurityQuestion] Captcha envoyé à ${member.user.tag} dans ${channel.name} : "${mathQuestion.question}" (Réponse: ${mathQuestion.answer})`);

        } catch (error) {
            console.error('❌ [SecurityQuestion] Erreur handleMemberJoin:', error);
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

        try {
            const captcha = await this.repo.getUserCaptcha(message.author.id, message.guild?.id);
            if (!captcha) return false;

            if (captcha.is_verified) {
                await message.reply("Vous êtes déjà vérifié !");
                return true;
            }

            // Vérifier expiration
            if (captcha.expires_at && new Date() > new Date(captcha.expires_at)) {
                await message.reply("❌ Le temps imparti pour répondre au captcha a expiré.");
                return true;
            }

            const userAnswer = message.content.trim();
            const maxAttempts = this.getConfig().max_attempts || 3;

            // Vérification réponse
            if (userAnswer === captcha.answer) {
                // ✅ Succès
                await this.repo.markVerified(message.author.id, message.guild.id);
                await message.reply("✅ Bravo ! Vous avez validé le captcha avec succès.");

                const role = await this.getVerifiedRole(message.guild);
                if (role && message.member) {
                    await message.member.roles.add(role.id).catch(() => {});
                    await sendCaptchaLog(message.guild, 'Succès captcha', `**${message.author.tag}** a validé le captcha - Rôle vérifié donné`, '#2ecc71');
                }

                if (message.member) {
                    await this.triggerWelcome(message.member);
                }

                setTimeout(async () => {
                    await message.channel.delete().catch(() => {});
                }, 3000);

                console.log(`✅ [SecurityQuestion] ${message.author.tag} a validé son captcha !`);
                return true;

            } else {
                // ❌ Échec
                const nextAttempts = (captcha.attempts || 0) + 1;
                await this.repo.updateAttempts(message.author.id, message.guild.id, nextAttempts);

                if (nextAttempts >= maxAttempts) {
                    await message.reply("❌ Trop de tentatives infructueuses. Vous allez être expulsé du serveur.");
                    if (message.member) {
                        await message.member.kick('Échec vérification captcha').catch(() => {});
                    }
                    await sendCaptchaLog(message.guild, 'Kick utilisateur', `**${message.author.tag}** kické - Max tentatives dépassé`, '#e74c3c');

                    setTimeout(async () => {
                        await message.channel.delete().catch(() => {});
                    }, 3000);

                    console.log(`🚫 [SecurityQuestion] ${message.author.tag} a dépassé les tentatives max et a été expulsé.`);
                    return true;
                }

                const remaining = maxAttempts - nextAttempts;
                await message.reply(`❌ Réponse incorrecte. Il vous reste **${remaining}** tentative(s).`);
                await sendCaptchaLog(message.guild, 'Tentative échouée', `**${message.author.tag}** - Réponse incorrecte (${nextAttempts}/${maxAttempts})`, '#f39c12');
                return true;
            }

        } catch (error) {
            console.error('❌ [SecurityQuestion] Erreur handleIncomingMessage:', error);
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
}

Injectable()(SecurityQuestionService);

module.exports = {
    SecurityQuestionService
};
