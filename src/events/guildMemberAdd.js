const { EmbedBuilder } = require('discord.js');
const { createCaptcha, isUserVerified, getCaptchaConfig } = require("../database.js");
const CAPTCHA_CONFIG = require("../config/captcha-config.js");
const WELCOME_CONFIG = require("../config/welcome-config.js");
const { sendCaptchaLog } = require("../utils/captchaLogger.js");

// Générer une question mathématique aléatoire
function generateMathQuestion() {
    const config = CAPTCHA_CONFIG.MATH_QUESTIONS;

    // Sélectionner une opération aléatoire basée sur les poids
    const operations = config.OPERATIONS;
    const weights = config.OPERATION_WEIGHTS;

    // Créer un tableau pondéré
    const weightedOperations = [];
    for (const op of operations) {
        const count = Math.floor(weights[op] * 100);
        for (let i = 0; i < count; i++) {
            weightedOperations.push(op);
        }
    }

    // Sélectionner une opération aléatoire
    const operator = weightedOperations[Math.floor(Math.random() * weightedOperations.length)];

    // Générer deux nombres aléatoires
    let num1, num2, answer;

    switch (operator) {
        case '+':
            num1 = Math.floor(Math.random() * (config.MAX_NUMBER - config.MIN_NUMBER + 1)) + config.MIN_NUMBER;
            num2 = Math.floor(Math.random() * (config.MAX_NUMBER - config.MIN_NUMBER + 1)) + config.MIN_NUMBER;
            answer = num1 + num2;
            break;

        case '-':
            num1 = Math.floor(Math.random() * (config.MAX_NUMBER - config.MIN_NUMBER + 1)) + config.MIN_NUMBER;
            num2 = Math.floor(Math.random() * (num1 - config.MIN_NUMBER + 1)) + config.MIN_NUMBER; // S'assurer que num2 <= num1
            answer = num1 - num2;
            break;

        case '*':
            num1 = Math.floor(Math.random() * (Math.min(config.MAX_NUMBER, 10) - config.MIN_NUMBER + 1)) + config.MIN_NUMBER;
            num2 = Math.floor(Math.random() * (Math.min(config.MAX_NUMBER, 10) - config.MIN_NUMBER + 1)) + config.MIN_NUMBER;
            answer = num1 * num2;
            break;

        default:
            num1 = Math.floor(Math.random() * (config.MAX_NUMBER - config.MIN_NUMBER + 1)) + config.MIN_NUMBER;
            num2 = Math.floor(Math.random() * (config.MAX_NUMBER - config.MIN_NUMBER + 1)) + config.MIN_NUMBER;
            answer = num1 + num2;
    }

    // Convertir les nombres en français
    const num1Str = numberToFrench(num1);
    const num2Str = numberToFrench(num2);

    // Formater la question
    const question = CAPTCHA_CONFIG.MESSAGES.CAPTCHA_QUESTION
        .replace('{num1}', num1Str)
        .replace('{operator}', operator)
        .replace('{num2}', num2Str);

    return {
        question,
        answer: answer.toString(),
        num1: num1Str,
        num2: num2Str,
        operator
    };
}

// Convertir un nombre en français (jusqu'à 20)
function numberToFrench(num) {
    const numbers = {
        1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq',
        6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix',
        11: 'onze', 12: 'douze', 13: 'treize', 14: 'quatorze', 15: 'quinze',
        16: 'seize', 17: 'dix-sept', 18: 'dix-huit', 19: 'dix-neuf', 20: 'vingt'
    };
    return numbers[num] || num.toString();
}

// Créer un canal de captcha si nécessaire
async function getOrCreateCaptchaChannel(guild) {
    const config = await getCaptchaConfig(guild.id);

    // Si un canal est configuré, l'utiliser
    if (config && config.channel_id) {
        try {
            const channel = await guild.channels.fetch(config.channel_id);
            if (channel) return channel;
        } catch (error) {
            console.error('❌ Impossible de récupérer le canal captcha configuré:', error);
        }
    }

    // Sinon, vérifier si CAPTCHA_CONFIG a un ID
    if (CAPTCHA_CONFIG.CAPTCHA_CHANNEL_ID) {
        try {
            const channel = await guild.channels.fetch(CAPTCHA_CONFIG.CAPTCHA_CHANNEL_ID);
            if (channel) return channel;
        } catch (error) {
            console.error('❌ Impossible de récupérer le canal captcha par défaut:', error);
        }
    }

    // Créer un nouveau canal
    try {
        const channel = await guild.channels.create({
            name: CAPTCHA_CONFIG.CAPTCHA_CHANNEL_NAME,
            type: 0, // Canal texte
            topic: 'Canal de vérification par captcha',
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: ['ViewChannel']
                },
                {
                    id: guild.id,
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                }
            ]
        });

        console.log(`✅ Canal captcha créé: ${channel.name} (${channel.id})`);
        return channel;
    } catch (error) {
        console.error('❌ Erreur lors de la création du canal captcha:', error);
        throw error;
    }
}

// Récupère le rôle vérifié configuré (NE CRÉE PAS de rôle - gère une seule guild)
async function getVerifiedRole(guild) {
    if (!CAPTCHA_CONFIG.VERIFIED_ROLE_ID) {
        console.error('❌ VERIFIED_ROLE_ID n\'est pas configuré dans captcha-config.js');
        return null;
    }

    try {
        const role = await guild.roles.fetch(CAPTCHA_CONFIG.VERIFIED_ROLE_ID);
        if (role) {
            return role;
        }
        console.error(`❌ Rôle avec ID ${CAPTCHA_CONFIG.VERIFIED_ROLE_ID} introuvable dans ce serveur`);
        return null;
    } catch (error) {
        console.error('❌ Erreur lors de la récupération du rôle vérifié (ID: ' + CAPTCHA_CONFIG.VERIFIED_ROLE_ID + '):', error);
        return null;
    }
}

// Créer un canal captcha UNIQUE pour un membre
async function createUserCaptchaChannel(member) {
    // Récupérer tous les rôles avec la permission Administrator
    const adminRoles = member.guild.roles.cache.filter(
        role => role.permissions.has('Administrator')
    );

    // Construire les permissionOverwrites
    const permissionOverwrites = [
        {
            id: member.guild.roles.everyone.id,
            deny: ['ViewChannel']  // Bloque tout le monde
        },
        {
            id: member.id,  // L'utilisateur a accès
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        }
    ];

    // Ajouter tous les rôles admin
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
            permissionOverwrites: permissionOverwrites
        });
        await sendCaptchaLog(member.guild, 'Création canal', `Canal captcha créé pour **${member.user.tag}** (ID: ${channel.id})`, '#3498db');
        return channel;
    } catch (error) {
        console.error('❌ Erreur création canal utilisateur:', error);
        throw error;
    }
}

/**
 * Gère l'attribution des rôles automatiques et l'envoi du message de bienvenue
 */
async function handleWelcome(member) {
    if (!WELCOME_CONFIG.ENABLED) return;

    // 1. Attribuer les rôles automatiques
    const autoRoles = WELCOME_CONFIG.AUTO_ROLES || [];
    if (Array.isArray(autoRoles) && autoRoles.length > 0) {
        for (const roleId of autoRoles) {
            try {
                if (roleId) await member.roles.add(roleId);
            } catch (err) {
                console.error(`❌ Erreur ajout rôle auto (${roleId}):`, err.message);
            }
        }
    }

    // 2. Message de bienvenue dans le salon public
    const welcomeMsgConf = WELCOME_CONFIG.WELCOME_MESSAGE;
    const channelId = WELCOME_CONFIG.WELCOME_CHANNEL_ID;
    if (welcomeMsgConf && welcomeMsgConf.enabled !== false && channelId) {
        try {
            const channel = await member.guild.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor(welcomeMsgConf.color || WELCOME_CONFIG.welcome_color || '#f2c7ce')
                    .setTitle(welcomeMsgConf.title?.replace('{server}', member.guild.name) || `🎉 Bienvenue sur ${member.guild.name} !`)
                    .setDescription(
                        welcomeMsgConf.description
                            ?.replace('{user}', `<@${member.id}>`)
                            ?.replace('{username}', member.user.username)
                            ?.replace('{server}', member.guild.name)
                            ?.replace('{memberCount}', member.guild.memberCount) || `Bienvenue <@${member.id}> !`
                    )
                    .setFooter({ text: welcomeMsgConf.footer?.replace('{memberCount}', member.guild.memberCount) || `Membre #${member.guild.memberCount}` })
                    .setTimestamp();

                if (welcomeMsgConf.thumbnail === 'user') {
                    embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
                } else if (welcomeMsgConf.thumbnail) {
                    embed.setThumbnail(welcomeMsgConf.thumbnail);
                }

                if (welcomeMsgConf.image) {
                    embed.setImage(welcomeMsgConf.image);
                }

                if (Array.isArray(welcomeMsgConf.fields)) {
                    for (const f of welcomeMsgConf.fields) {
                        embed.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                    }
                }

                await channel.send({ embeds: [embed] });
            }
        } catch (err) {
            console.error('❌ Erreur envoi message de bienvenue:', err.message);
        }
    }

    // 3. Message privé (DM)
    const dmConf = WELCOME_CONFIG.DM_MESSAGE;
    if (WELCOME_CONFIG.SEND_DM && dmConf && dmConf.enabled !== false) {
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(dmConf.color || '#f2c7ce')
                .setTitle(dmConf.title?.replace('{server}', member.guild.name) || '👋 Bienvenue !')
                .setDescription(
                    dmConf.description
                        ?.replace('{user}', `<@${member.id}>`)
                        ?.replace('{username}', member.user.username)
                        ?.replace('{server}', member.guild.name) || `Salut ${member.user.username} !`
                );

            if (Array.isArray(dmConf.fields)) {
                for (const f of dmConf.fields) {
                    dmEmbed.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                }
            }

            await member.send({ embeds: [dmEmbed] });
        } catch (err) {
            console.warn(`⚠️ Impossible d'envoyer un DM de bienvenue à ${member.user.tag}:`, err.message);
        }
    }
}

module.exports = {
    name: 'guildMemberAdd',
    handleWelcome,

    async execute(member) {
        // Ignorer les bots
        if (member.user.bot) {
            console.log(`ℹ️ Bot détecté - ${member.user.tag} ignoré`);
            return;
        }

        // Vérifier si le système de captcha est activé
        if (!CAPTCHA_CONFIG.ENABLED) {
            console.log(`ℹ️ Captcha désactivé - ${member.user.tag} rejoint sans vérification`);
            await handleWelcome(member);
            return;
        }

        try {
            // Vérifier si l'utilisateur est déjà vérifié
            const alreadyVerified = await isUserVerified(member.id, member.guild.id);

            if (alreadyVerified) {
                await sendCaptchaLog(member.guild, 'Déjà vérifié', `**${member.user.tag}** est déjà vérifié`, "#3498db");
                // Donner le rôle vérifié
                try {
                    const verifiedRole = await getVerifiedRole(member.guild);
                    if (verifiedRole) {
                        await member.roles.add(verifiedRole.id);
                        await sendCaptchaLog(member.guild, 'Succès captcha', `**${member.user.tag}** a validé le captcha - Rôle vérifié donné`, '#3498db');
                    } else {
                        console.error('❌ Rôle vérifié introuvable. Le captcha est validé mais aucun rôle attribué.');
                    }
                } catch (error) {
                    console.error('❌ Erreur lors de l\'ajout du rôle vérifié:', error);
                }
                await handleWelcome(member);
                return;
            }

            // Obtenir ou créer le canal captcha
            //const captchaChannel = await getOrCreateCaptchaChannel(member.guild);
            const captchaChannel = await createUserCaptchaChannel(member);

            // Générer une question mathématique
            const mathQuestion = generateMathQuestion();

            // Créer le captcha dans la base de données
            await createCaptcha(
                member.id,
                member.user.username,
                member.guild.id,
                mathQuestion.question,
                mathQuestion.answer,
                captchaChannel.id,
                CAPTCHA_CONFIG.CAPTCHA_TIMEOUT
            );

            // Envoyer le message de bienvenue avec le captcha
            const welcomeMessage = CAPTCHA_CONFIG.MESSAGES.WELCOME_MESSAGE;
            const instructions = CAPTCHA_CONFIG.MESSAGES.INSTRUCTIONS;

            const message = `${member.user}, ${welcomeMessage}

**${mathQuestion.question}**

${instructions}`;

            // Donner les permissions au membre pour voir et écrire dans le canal
            try {
                await captchaChannel.permissionOverwrites.create(member.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });
            } catch (error) {
                console.error('❌ Erreur lors de l\'ajout des permissions:', error);
            }

            // Envoyer le message
            const sentMessage = await captchaChannel.send({
                content: message,
                embeds: [{
                    description: `**${mathQuestion.question}**`,
                    color: 0x3498db,
                    footer: { text: 'Réponds avec le nombre en chiffres uniquement' }
                }]
            });

            await sendCaptchaLog(member.guild, 'Captcha envoyé', `Captcha envoyé à **${member.user.tag}** (ID: ${member.id}) - Question: ${mathQuestion.question}`, "#3498db");

            // Démarrer un timeout pour supprimer le captcha après expiration
            const timeoutMinutes = CAPTCHA_CONFIG.CAPTCHA_TIMEOUT;
            setTimeout(async () => {
                try {
                    const currentCaptcha = await require("../database.js").getUserCaptcha(member.id, member.guild.id);
                    if (currentCaptcha && !currentCaptcha.is_verified) {
                        // Marquer comme expiré (sans incrémenter les tentatives)
                        await require("../database.js").expireCaptcha(member.id, member.guild.id, false);

                        // Envoyer un message d'expiration
                        await captchaChannel.send({
                            content: `${member.user}, ${CAPTCHA_CONFIG.MESSAGES.TIMEOUT_MESSAGE}`
                        });

                        // Kicker immédiatement après le premier timeout
                        try {
                            await member.kick('Captcha non validé à temps');
                            await sendCaptchaLog(member.guild, 'Kick utilisateur', `**${member.user.tag}** kické - Timeout captcha (10 minutes écoulées)`, '#ff0000');
                        } catch (error) {
                            console.error('❌ Erreur kick timeout:', error);
                        }

                        // Supprimer le canal après un délai pour laisser le temps de lire le message
                        setTimeout(async () => {
                            try {
                                await captchaChannel.delete();
                                await sendCaptchaLog(member.guild, 'Suppression canal', `Canal captcha de **${member.user.tag}** supprimé (timeout)`, "#3498db");
                            } catch (error) {
                                console.error('❌ Erreur suppression canal timeout:', error);
                            }
                        }, 5000); // Attend 5 secondes
                    }
                } catch (error) {
                    console.error('❌ Erreur lors du timeout du captcha:', error);
                }
            }, timeoutMinutes * 60 * 1000);

        } catch (error) {
            console.error(`❌ Erreur lors de la création du captcha pour ${member.user.tag}:`, error);
        }
    }
};
