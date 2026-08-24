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
        if (member.user.bot) return;

        // Si le captcha est activé, SecurityQuestionModule gère la création du captcha et déclenchera handleWelcome ensuite
        const { config, getConfig } = require('../config/index.js');
        const currentConf = getConfig ? getConfig() : config;
        const isCaptchaActive = currentConf.captcha && currentConf.captcha.enabled !== false;

        if (!isCaptchaActive) {
            await handleWelcome(member);
        }
    }
};
