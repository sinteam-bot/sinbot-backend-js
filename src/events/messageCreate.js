const { logUserEvent, addMessageXP, verifyCaptchaAnswer, getUserCaptcha, isUserVerified, getCaptchaConfig } = require('../database');
const { executeCommand } = require('../utils/commandHandler');
const { sendCaptchaLog } = require('../utils/captchaLogger');

const path = require('path');

// ⭐ IMPORTANT : Remonter d'un niveau pour trouver .env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function addHours(date, hours) {
  const hoursToAdd = hours * 60 * 60 * 1000;
  date.setTime(date.getTime() + hoursToAdd);
  return date;
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = '1348741823237062781';
const CAPTCHA_CONFIG = require('../config/captcha-config');

// Vérifier si un message est une réponse au captcha
async function handleCaptchaResponse(message) {
    // Ignorer les messages du bot
    if (message.author.bot) return false;
    
    // Vérifier si le message est dans un canal captcha
    const isCaptchaChannel = message.channel.name.includes('verification') || 
                            message.channel.name.includes('captcha') ||
                            message.channel.topic?.includes('vérification') ||
                            message.channel.topic?.includes('captcha');
    
    if (!isCaptchaChannel) return false;
    
    try {
        // Récupérer le captcha de l'utilisateur
        const captcha = await getUserCaptcha(message.author.id, message.guild.id);
        
        if (!captcha) {
            // Pas de captcha en attente pour cet utilisateur
            return false;
        }
        
        // Vérifier si déjà vérifié
        if (captcha.is_verified) {
            await message.reply(CAPTCHA_CONFIG.MESSAGES.ALREADY_VERIFIED);
            return true;
        }
        
        // Vérifier si le message est une réponse valide (nombre)
        const userAnswer = message.content.trim();
        
        // Vérifier la réponse (les chaînes non numériques seront traitées comme réponses incorrectes)
        const result = await verifyCaptchaAnswer(message.author.id, message.guild.id, userAnswer);
        
        if (result.success) {
            // Réponse correcte - donner le rôle vérifié
            await message.reply(CAPTCHA_CONFIG.MESSAGES.SUCCESS_MESSAGE);
            
            // Donner le rôle vérifié
            try {
                const verifiedRole = await getVerifiedRole(message.guild);
                if (verifiedRole) {
                    await message.member.roles.add(verifiedRole.id);
                    await sendCaptchaLog(message.guild, 'Succès captcha', `**${message.author.tag}** a validé le captcha - Rôle vérifié donné`, '#e6d9e7');
                } else {
                    console.error('❌ Rôle vérifié introuvable. Le captcha est validé mais aucun rôle attribué.');
                }
            } catch (error) {
                console.error('❌ Erreur lors de l\'ajout du rôle vérifié:', error);
            }
            
            // Supprimer le canal captcha après succès
            try {
                await message.channel.delete();
                await sendCaptchaLog(message.guild, 'Succès captcha', `Canal captcha de **${message.author.tag}** supprimé (succès)`);
            } catch (error) {
                console.error('❌ Erreur suppression canal succès:', error);
            }
            
            return true;
            
        } else if (result.reason === 'wrong_answer') {
            // Réponse incorrecte
            const remainingAttempts = CAPTCHA_CONFIG.MAX_ATTEMPTS - result.attempts;
            const isNotANumber = isNaN(parseInt(userAnswer, 10));
            const replyMessage = isNotANumber
                ? '❌ Veuillez répondre avec un **nombre en chiffres** uniquement (exemple: 18).'
                : CAPTCHA_CONFIG.MESSAGES.FAIL_MESSAGE.replace('{attempts}', remainingAttempts);
            
            await message.reply(replyMessage);
            await sendCaptchaLog(message.guild, 'Tentative échouée', `**${message.author.tag}** - Réponse incorrecte (Tentative ${result.attempts}/${CAPTCHA_CONFIG.MAX_ATTEMPTS})`, '#f39c12');
            return true;
            
        } else if (result.reason === 'max_attempts_reached') {
            // Trop de tentatives
            await message.reply(CAPTCHA_CONFIG.MESSAGES.MAX_ATTEMPTS_MESSAGE);
            
            // Kicker l'utilisateur
            try {
                await message.member.kick('Trop de tentatives de captcha');
                await sendCaptchaLog(message.guild, 'Kick utilisateur', `**${message.author.tag}** kické - Max tentatives de captcha atteint`, '#ff0000');
            } catch (error) {
                console.error('❌ Erreur kick max tentatives:', error);
            }
            
            // Supprimer le canal captcha après échec
            try {
                await message.channel.delete();
                await sendCaptchaLog(message.guild, 'Suppression canal', `Canal captcha de **${message.author.tag}** supprimé (échec - max tentatives)`);
            } catch (error) {
                console.error('❌ Erreur suppression canal échec:', error);
            }
            
            return true;
            
        } else if (result.reason === 'expired') {
            await message.reply(CAPTCHA_CONFIG.MESSAGES.TIMEOUT_MESSAGE);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Erreur lors de la vérification du captcha:', error);
        return false;
    }
}

// Récupère le rôle vérifié configuré (NE CRÉE PAS de rôle)
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

module.exports = {
    name: 'messageCreate',
    
    async execute(message) {
        // Ignorer les messages du bot lui-même
        if (message.author.bot){
            if(message.author.id == '302050872383242240'){
                if (message.embeds.length === 0) return;
                const chaineRecherchee = "Bump effectué !"
                for (const embed of message.embeds) {
                    if (embed.description && embed.description.includes(chaineRecherchee)) {

                        const guild = await message.guild;
                        //const channel = await guild.channels.fetch(CHANNEL_ID);

                        const deuxHeures = 2 * 60 * 60 * 1000;

                        setTimeout(async () => {
                            await message.channel.send(`<@&1427703047534153872> **c'est l'heure**`);
                        }, deuxHeures);
                    }
                }
            }
        }else{
             //return false; //to deactivate the captcha
            // Vérifier si c'est une réponse au captcha
            const isCaptchaResponse = await handleCaptchaResponse(message);
            
            // Si ce n'est pas une réponse au captcha, continuer avec le traitement normal
            if (!isCaptchaResponse) {
                // Log de l'événement utilisateur
                await logUserEvent(
                    message.author.id,
                    message.author.username,
                    'message',
                    {
                        channelId: message.channelId,
                        channelName: message.channel.name,
                        contentLength: message.content.length,
                        guildId: message.guildId,
                        guildName: message.guild?.name
                    }
                );
                
                // Ajouter de l'XP pour le message
                await addMessageXP(message.author.id, message.author.username);
            }
        }
    }
};
