/**
 * Utilitaire pour logger les actions du captcha dans le canal dédié
 */

const CAPTCHA_CONFIG = require('../config/captcha-config');

/**
 * Envoyer un log dans le canal de logs captcha
 * @param {object} guild - L'objet Guild de Discord.js
 * @param {string} action - L'action à logger (ex: "Création", "Succès", "Échec", etc.)
 * @param {string} message - Le message de log
 * @param {string} color - La couleur de l'embed (optionnel)
 */
async function sendCaptchaLog(guild, action, message, color = '#e6d9e7') {
    // Vérifier si le logging est activé et si un canal est configuré
    if (!CAPTCHA_CONFIG.CAPTCHA_LOG_CHANNEL) {
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
        return;
    }
    
    try {
        const { EmbedBuilder } = require('discord.js');
        
        // Récupérer le canal de logs
        const logChannel = await guild.channels.fetch(CAPTCHA_CONFIG.CAPTCHA_LOG_CHANNEL);
        
        if (!logChannel) {
            console.log(`[CAPTCHA LOG] Canal de logs non trouvé: ${CAPTCHA_CONFIG.CAPTCHA_LOG_CHANNEL}`);
            console.log(`[CAPTCHA LOG] ${action}: ${message}`);
            return;
        }
        
        // Créer un embed pour le log
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`⚡ ${action}`)
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: 'Captcha System' });
        
        // Envoyer le message dans le canal de logs
        await logChannel.send({ embeds: [embed] });
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
    } catch (error) {
        console.error('❌ Erreur envoi log captcha:', error);
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
    }
}

module.exports = { sendCaptchaLog };
