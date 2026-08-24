const CAPTCHA_CONFIG = require('./captcha.config.js');
const { EmbedBuilder } = require('discord.js');

/**
 * Envoyer un log dans le canal de logs captcha
 * @param {object} guild - L'objet Guild de Discord.js
 * @param {string} action - L'action à logger (ex: "Création", "Succès", "Échec", etc.)
 * @param {string} message - Le message de log
 * @param {string} color - La couleur de l'embed (optionnel)
 */
async function sendCaptchaLog(guild, action, message, color = '#e6d9e7') {
    if (!CAPTCHA_CONFIG.CAPTCHA_LOG_CHANNEL || !guild) {
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
        return;
    }
    
    try {
        const logChannel = await guild.channels.fetch(CAPTCHA_CONFIG.CAPTCHA_LOG_CHANNEL);
        
        if (!logChannel || !logChannel.isTextBased()) {
            console.log(`[CAPTCHA LOG] ${action}: ${message}`);
            return;
        }
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`⚡ ${action}`)
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: 'Système Captcha' });
        
        await logChannel.send({ embeds: [embed] });
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
    } catch (error) {
        console.error('❌ Erreur envoi log captcha:', error.message);
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
    }
}

module.exports = { sendCaptchaLog };
