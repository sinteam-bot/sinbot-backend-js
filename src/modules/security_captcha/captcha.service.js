const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { CaptchaRepository } = require('./captcha.repository.js');
const { config, getConfig } = require('../../config/index.js');
const { sendCaptchaLog } = require('./captcha-logger.js');
const { getChallenge, listAvailable } = require('./challenges/index.js');
const { generateTtsAttachment } = require('./challenges/tts.js');
const DiscordCacheService = require('../../services/discordCacheService.js');
const logger = require('../../utils/logger.js');

class CaptchaService {
    static inject = [CaptchaRepository];

    constructor(repository) {
        this.repo = repository;
    }

    async getConfig(guildId) {
        if (guildId) {
            try {
                const { getFeatureConfig } = require('../../config/c12-loader.js');
                const cfg = await getFeatureConfig(guildId, 'captcha');
                if (cfg && Object.keys(cfg).length > 0) return cfg;
            } catch (e) {
                console.warn(`[Captcha] Erreur chargement config guild ${guildId}:`, e.message);
            }
        }
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

    generateMathQuestion(guildOrConfig) {
        let captchaConfig = {};
        if (typeof guildOrConfig === 'string') {
            try {
                const { _featureCache } = require('../../config/c12-loader.js');
                const cached = _featureCache?.get(`${guildOrConfig}:captcha`);
                if (cached) captchaConfig = cached;
            } catch {}
        } else if (guildOrConfig && typeof guildOrConfig === 'object') {
            captchaConfig = guildOrConfig;
        }

        if (!captchaConfig || Object.keys(captchaConfig).length === 0) {
            const currentConfig = getConfig ? getConfig() : config;
            captchaConfig = currentConfig.captcha || {};
        }

        const math = captchaConfig.math_questions || {};
        const minNum = math.min_number ?? captchaConfig.min_number ?? 1;
        const maxNum = math.max_number ?? captchaConfig.max_number ?? 20;

        const operations = math.operations ?? captchaConfig.operations ?? ['+', '-', '*'];
        const weights = math.operation_weights ?? captchaConfig.operation_weights ?? { '+': 0.5, '-': 0.3, '*': 0.2 };

        const weightedOperations = [];
        for (const op of operations) {
            const count = Math.floor((weights[op] ?? 0.3) * 100);
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

        // Version texte des symboles mathématiques ("+": "plus", "-": "moins", "*": "fois")
        const useWordOperators = math.use_word_operators ?? captchaConfig.use_word_operators ?? false;
        const wordOperatorsMap = {
            '+': 'plus',
            '-': 'moins',
            '*': 'fois',
            ...(math.word_operators || {}),
            ...(captchaConfig.word_operators || {})
        };

        const displayOperator = useWordOperators ? (wordOperatorsMap[operator] || operator) : operator;

        const template = captchaConfig.messages?.captcha_question || captchaConfig.messages?.CAPTCHA_QUESTION || 'Combien font {num1} {operator} {num2} ?';
        const question = template
            .replace('{num1}', num1Str)
            .replace('{operator}', displayOperator)
            .replace('{num2}', num2Str);

        return {
            question,
            answer: answer.toString(),
            num1: num1Str,
            num2: num2Str,
            operator,
            displayOperator,
            useWordOperators
        };
    }

    async getVerifiedRole(guild, customConfig) {
        const captchaConfig = customConfig || await this.getConfig(guild?.id);
        const roleId = captchaConfig.verified_role_id || process.env.VERIFIED_ROLE_ID;
        if (!roleId) return null;

        try {
            return await guild.roles.fetch(roleId);
        } catch (error) {
            console.error(`❌ [Captcha] Rôle vérifié (ID: ${roleId}) introuvable:`, error);
            return null;
        }
    }

    async createUserCaptchaChannel(member, customConfig) {
        const captchaConfig = customConfig || await this.getConfig(member?.guild?.id);
        const nameTemplate = captchaConfig.captcha_channel_name || 'captcha-{username}';
        const channelName = nameTemplate
            .replace('{username}', member.user.username.toLowerCase())
            .replace('{tag}', member.user.tag.toLowerCase())
            .replace('{userid}', member.id);

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
                name: channelName,
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

        const captchaConfig = await this.getConfig(member.guild.id);
        if (captchaConfig.enabled === false) {
            console.log(`ℹ️ [Captcha] Captcha désactivé - ${member.user.tag} rejoint sans vérification`);
            await this.triggerWelcome(member);
            return;
        }

        try {
            const existing = await this.repo.getUserCaptcha(member.id, member.guild.id);
            if (existing && existing.is_verified) {
                const role = await this.getVerifiedRole(member.guild, captchaConfig);
                if (role) {
                    await member.roles.add(role.id).catch(err => {
                        console.warn('[Captcha] Impossible d\'ajouter le rôle vérifié:', err.message);
                    });
                }
                await sendCaptchaLog(member.guild, 'Déjà vérifié', `**${member.user.tag}** est déjà vérifié sur le serveur. Rôle appliqué directement.`, '#3498db', {
                    member,
                    role,
                    logChannelId: captchaConfig.log_channel_id
                });
                await this.triggerWelcome(member);
                return;
            }

            const channel = await this.createUserCaptchaChannel(member, captchaConfig);

            // Sélection du type de captcha selon la config de la guilde
            const captchaType = captchaConfig.captcha_type || 'math';
            const challenge = getChallenge(captchaType);

            let challengeResult;
            try {
                challengeResult = await challenge.generate({
                    captchaConfig,
                    userId: member.id,
                    guildId: member.guild.id
                });
            } catch (err) {
                if (err.message === 'canvas_not_installed' || err.code === 'HCAPTCHA_NOT_CONFIGURED') {
                    console.warn(`[Captcha] Type "${captchaType}" indisponible (${err.message}), fallback sur math`);
                    const fallback = getChallenge('math');
                    challengeResult = await fallback.generate({ captchaConfig, userId: member.id, guildId: member.guild.id });
                } else {
                    throw err;
                }
            }

            const timeoutMinutes = captchaConfig.timeout_minutes || captchaConfig.captcha_timeout || 10;

            await this.repo.createCaptcha(
                member.id,
                member.user.username,
                member.guild.id,
                challengeResult.question,
                challengeResult.answer,
                channel.id,
                timeoutMinutes
            );

            await sendCaptchaLog(member.guild, 'Création canal', `Canal temporaire de vérification créé pour **${member.user.tag}** (type: ${challenge.type})`, '#5865F2', {
                member,
                channel,
                question: challengeResult.question,
                timeoutMinutes,
                maxAttempts: captchaConfig.max_attempts || 3,
                logChannelId: captchaConfig.log_channel_id
            });

            const welcomeMsg = captchaConfig.messages?.welcome_message || "Bienvenue sur le serveur ! Pour des raisons de sécurité, veuillez résoudre ce calcul :";
            const instructions = captchaConfig.messages?.instructions || "Répondez avec le nombre en chiffres uniquement (exemple: 12) dans les 10 minutes.";

            // Construction du message de bienvenue en fonction du type
            let content;
            const files = [];
            const components = [];

            if (challenge.type === 'image') {
                const payload = challengeResult.payload || {};
                if (payload.filePath) {
                    try {
                        const fs = require('fs');
                        const att = new AttachmentBuilder(payload.filePath, { name: payload.filename || 'captcha.png' });
                        files.push(att);
                    } catch (e) {
                        console.warn('[Captcha] Impossible de charger l\'image générée:', e.message);
                    }
                }
                content = `${member.user}, ${welcomeMsg}\n\n**${challengeResult.question}**\n\n${instructions}`;
            } else if (challenge.type === 'web') {
                const payload = challengeResult.payload || {};
                const verifyUrl = payload.verifyUrl;
                const linkRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('🛡️ Ouvrir la vérification hCaptcha')
                        .setStyle(ButtonStyle.Link)
                        .setURL(verifyUrl)
                );
                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`captcha_web_validated:${member.id}`)
                        .setLabel('✅ J\'ai validé le hCaptcha')
                        .setStyle(ButtonStyle.Success)
                );
                components.push(linkRow, confirmRow);
                content = `${member.user}, ${welcomeMsg}\n\n**${challengeResult.question}**\n\n${instructions}\n\n🔗 **Lien de vérification :** ${verifyUrl}`;
            } else {
                content = `${member.user}, ${welcomeMsg}\n\n**${challengeResult.question}**\n\n${instructions}`;
            }

            // Accessibilité audio : attache un WAV TTS pour le mode math
            // (le membre peut l'écouter localement s'il a des difficultés
            // de lecture). Pour les autres modes, le WAV n'est pas
            // pertinent (image = OCR visuel, web = page web).
            if (captchaConfig.audio_accessibility === true && challenge.type === 'math') {
                const payload = challengeResult.payload || {};
                const n1 = payload.num1Value;
                const n2 = payload.num2Value;
                const op = payload.operator;
                if (n1 !== undefined && n2 !== undefined && op) {
                    try {
                        const tts = generateTtsAttachment({
                            num1: n1,
                            num2: n2,
                            operator: op,
                            guildId: member.guild.id
                        });
                        files.push(new AttachmentBuilder(tts.filePath, { name: tts.filename }));
                        content += `\n\n🔊 *Accessibilité audio : le fichier joint prononce la question.*`;
                    } catch (ttsErr) {
                        console.warn('[Captcha] Erreur génération TTS accessibilité:', ttsErr.message);
                    }
                }
            }

            const sentMsg = await channel.send({
                content,
                files: files.length ? files : undefined,
                components: components.length ? components : undefined
            });
            if (sentMsg) {
                try {
                    await DiscordCacheService.cacheDiscordMessage(sentMsg);
                } catch (err) {
                    console.debug('[Captcha] Erreur mise en cache message envoyé:', err.message);
                }
            }

            console.log(`🔒 [Captcha] (${challenge.type}) Captcha envoyé à ${member.user.tag} dans ${channel.name} : "${challengeResult.question}" (Réponse: ${challengeResult.answer})`);

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
            const captchaConfig = await this.getConfig(message.guild?.id);
            const maxAttempts = captchaConfig.max_attempts || 3;

            // Pour le mode web, l'utilisateur colle ici le validationToken reçu
            // après validation hCaptcha. Si c'est un validationToken
            // signé (commence par un base64url suivi d'un point et d'un
            // autre base64url), on délègue à confirmWebCaptcha.
            if ((captchaConfig.captcha_type || 'math') === 'web') {
                if (userAnswer.includes('.') && userAnswer.length > 50) {
                    const client = message.client;
                    const result = await this.confirmWebCaptcha({
                        validationToken: userAnswer,
                        guildId: message.guild.id,
                        channelId: message.channel.id,
                        client
                    });
                    if (result.success) {
                        const rep = await message.reply('✅ Captcha validé avec succès ! Bienvenue sur le serveur 🎉');
                        if (rep) {
                            try { await DiscordCacheService.cacheDiscordMessage(rep); } catch (err) { console.debug('[Captcha] Cache reply failed:', err.message); }
                        }
                        return true;
                    }
                    const rep = await message.reply('❌ Token invalide ou expiré. Merci de résoudre à nouveau le hCaptcha.');
                    if (rep) {
                        try { await DiscordCacheService.cacheDiscordMessage(rep); } catch (err) { console.debug('[Captcha] Cache reply failed:', err.message); }
                    }
                    return true;
                }
                const rep = await message.reply('ℹ️ Pour ce captcha, clique sur le lien dans le message d\'accueil, résous le hCaptcha, puis colle ici le validationToken affiché sur la page de confirmation.');
                if (rep) {
                    try { await DiscordCacheService.cacheDiscordMessage(rep); } catch (err) { console.debug('[Captcha] Cache reply failed:', err.message); }
                }
                return true;
            }

            // Vérification polymorphique via le challenge registry
            const challengeType = captchaConfig.captcha_type || 'math';
            const challenge = getChallenge(challengeType);
            const isValid = await challenge.verify({
                userAnswer,
                expectedAnswer: captcha.answer,
                payload: { captchaConfig }
            });

            // Vérification réponse
            if (isValid) {
                // ✅ Succès
                await this.repo.markVerified(message.author.id, message.guild.id);
                const rep = await message.reply("✅ Bravo ! Vous avez validé le captcha avec succès.");
                if (rep) {
                    try { await DiscordCacheService.cacheDiscordMessage(rep); } catch (err) { console.debug('[Captcha] Cache reply failed:', err.message); }
                }

                const role = await this.getVerifiedRole(message.guild, captchaConfig);
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
                    role,
                    logChannelId: captchaConfig.log_channel_id
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
                        reason: 'Nombre maximal de tentatives dépassé',
                        logChannelId: captchaConfig.log_channel_id
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
                    remaining,
                    logChannelId: captchaConfig.log_channel_id
                });
                return true;
            }

        } catch (error) {
            console.error('❌ [Captcha] Erreur handleIncomingMessage:', error);
            return false;
        }
    }

    /**
     * Valide un clic sur "J'ai validé" depuis Discord (mode web).
     * Vérifie le validationToken signé, marque le captcha comme
     * vérifié, attribue le rôle vérifié, journalise et déclenche le
     * welcome. Supprime le salon captcha après 3s.
     */
    async confirmWebCaptcha({ validationToken, guildId, channelId, client }) {
        const webChallenge = require('./challenges/web.js');
        const captchaConfig = await this.getConfig(guildId);
        const captcha = await this.repo.getUserCaptchaByChannel(channelId);
        if (!captcha) {
            return { success: false, error: 'no_active_captcha_for_channel' };
        }
        if (captcha.is_verified === 1) {
            return { success: true, message: 'déjà vérifié' };
        }

        const isValid = await webChallenge.verify({
            userAnswer: validationToken,
            expectedAnswer: captcha.answer,
            payload: {}
        });
        if (!isValid) {
            return { success: false, error: 'invalid_validation_token' };
        }

        await this.repo.markVerified(captcha.user_id, captcha.guild_id);

        // Attribution du rôle vérifié + welcome
        if (client) {
            try {
                const guild = await client.guilds.fetch(captcha.guild_id).catch(() => null);
                if (guild) {
                    const member = await guild.members.fetch(captcha.user_id).catch(() => null);
                    const role = await this.getVerifiedRole(guild, captchaConfig);
                    if (role && member) {
                        await member.roles.add(role.id).catch(() => {});
                    }
                    const channel = await guild.channels.fetch(channelId).catch(() => null);

                    await sendCaptchaLog(guild, 'Succès captcha', `**${captcha.username || captcha.user_id}** a validé le hCaptcha avec succès.`, '#2ecc71', {
                        member,
                        user: member?.user,
                        channel,
                        question: captcha.question,
                        maxAttempts: captchaConfig.max_attempts || 3,
                        role,
                        logChannelId: captchaConfig.log_channel_id
                    });

                    if (member) {
                        await this.triggerWelcome(member);
                    }
                    if (channel) {
                        setTimeout(() => {
                            channel.delete().catch(() => {});
                        }, 3000);
                    }
                }
            } catch (err) {
                console.warn('[Captcha] Erreur post-confirm-web:', err.message);
            }
        }

        return { success: true, message: 'Captcha validé avec succès.' };
    }

    /**
     * Traite les captchas expirés mais non vérifiés :
     * kick le membre, supprime le salon dédié, journalise l'événement.
     * Appelé par le cron `captcha-cleanup.cron.js` toutes les minutes.
     *
     * @param {import('discord.js').Client} client
     * @returns {Promise<number>} nombre de captchas expirés traités
     */
    async processExpiredCaptchas(client) {
        if (!client) {
            console.warn('[Captcha] processExpiredCaptchas appelé sans client Discord');
            return 0;
        }

        let processed = 0;
        let expired;
        try {
            expired = await this.repo.getExpiredCaptchas(new Date(), 50);
        } catch (err) {
            console.error('[Captcha] Erreur récupération captchas expirés:', err.message);
            return 0;
        }

        if (!expired || expired.length === 0) return 0;

        for (const captcha of expired) {
            try {
                const guild = await client.guilds.fetch(captcha.guildId).catch(() => null);
                if (!guild) {
                    await this.repo.markExpired(captcha.userId, captcha.guildId).catch(() => {});
                    continue;
                }

                const captchaConfig = await this.getConfig(captcha.guildId);
                if (captchaConfig.enabled === false) {
                    await this.repo.markExpired(captcha.userId, captcha.guildId).catch(() => {});
                    continue;
                }

                const logChannelId = captchaConfig.log_channel_id || captchaConfig.channel_id;

                let member = null;
                try {
                    member = await guild.members.fetch(captcha.userId).catch(() => null);
                } catch {}

                if (member && member.kickable) {
                    await member.kick(`Captcha expiré après ${captchaConfig.timeout_minutes || captchaConfig.captcha_timeout || 10} minutes sans réponse`).catch(err => {
                        console.warn(`[Captcha] Échec kick ${captcha.userId} (expiré):`, err.message);
                    });
                } else if (member) {
                    console.warn(`[Captcha] Membre ${captcha.userId} non kickable (rôle supérieur ?). Salon supprimé sans kick.`);
                }

                if (captcha.channelId) {
                    const channel = await guild.channels.fetch(captcha.channelId).catch(() => null);
                    if (channel && channel.deletable) {
                        await channel.delete('Captcha expiré').catch(err => {
                            console.warn(`[Captcha] Échec suppression salon ${captcha.channelId} (expiré):`, err.message);
                        });
                    }
                }

                await sendCaptchaLog(guild, 'Captcha expiré', `**${captcha.username || captcha.userId}** a été expulsé suite à l'expiration du captcha (${captchaConfig.timeout_minutes || captchaConfig.captcha_timeout || 10} min sans réponse).`, '#ED4245', {
                    userId: captcha.userId,
                    username: captcha.username,
                    channelId: captcha.channelId,
                    channelName: captcha.channel_name,
                    question: captcha.question,
                    timeoutMinutes: captchaConfig.timeout_minutes || captchaConfig.captcha_timeout || 10,
                    reason: 'Temps imparti écoulé',
                    logChannelId
                });

                await this.repo.markExpired(captcha.userId, captcha.guildId);
                processed++;

                console.log(`⏰ [Captcha] Captcha expiré traité pour ${captcha.username || captcha.userId} (guild ${captcha.guildId})`);
            } catch (err) {
                console.error(`[Captcha] Erreur traitement captcha expiré ${captcha.id}:`, err.message);
            }
        }

        return processed;
    }

    /**
     * Récupère l'historique et les statistiques pour le Dashboard
     */
    async getCaptchaOverview() {
        const rawCaptchas = await this.repo.getAllCaptchas(100);
        const captchaConfig = this.getConfig();
        const maxAttempts = captchaConfig.max_attempts || 3;

        const captchas = rawCaptchas.map(c => {
            const isExpired = c.expired_at
                || (c.expires_at ? new Date() > new Date(c.expires_at) : false);
            let status = 'pending';
            if (c.is_verified === 1) status = 'verified';
            else if (c.attempts >= maxAttempts) status = 'failed';
            else if (isExpired) status = 'expired';

            const isChannelDeleted = !!(c.channel_deleted_at || c.expired_at);

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
                isChannelDeleted,
                createdAt: c.created_at,
                expiresAt: c.expires_at,
                verifiedAt: c.verified_at,
                expiredAt: c.expired_at || null
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

