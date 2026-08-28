const CAPTCHA_CONFIG = require('./captcha.config.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { config, getConfig } = require('../../config/index.js');

/**
 * Construit un Embed riche et interactif pour les logs Captcha
 * @param {string} action - L'action à logger
 * @param {string} message - Le message descriptif
 * @param {string} color - La couleur de l'embed
 * @param {object} options - Options détaillées (member, channel, question, attempts, etc.)
 * @param {object} guild - La guilde Discord
 * @returns {{ embed: EmbedBuilder, row: ActionRowBuilder|null }}
 */
function buildCaptchaLogEmbed(action, message, color = '#5865F2', options = {}, guild = null) {
    let title = `⚡ [Captcha] ${action}`;
    let embedColor = color;
    let iconEmoji = '⚡';

    const normalizedAction = (action || '').toLowerCase();
    if (normalizedAction.includes('création') || normalizedAction.includes('creation')) {
        title = '🛡️ [Captcha] Début de vérification';
        embedColor = '#5865F2';
        iconEmoji = '🛡️';
    } else if (normalizedAction.includes('succès') || normalizedAction.includes('succes') || normalizedAction.includes('validé')) {
        title = '✅ [Captcha] Vérification Réussie';
        embedColor = '#57F287';
        iconEmoji = '✅';
    } else if (normalizedAction.includes('échec') || normalizedAction.includes('echec') || normalizedAction.includes('incorrect') || normalizedAction.includes('échouée') || normalizedAction.includes('echouee')) {
        title = '⚠️ [Captcha] Réponse Incorrecte';
        embedColor = '#FEE75C';
        iconEmoji = '⚠️';
    } else if (normalizedAction.includes('kick') || normalizedAction.includes('expuls')) {
        title = '🚫 [Captcha] Expulsion du Membre';
        embedColor = '#ED4245';
        iconEmoji = '🚫';
    } else if (normalizedAction.includes('déjà') || normalizedAction.includes('deja')) {
        title = 'ℹ️ [Captcha] Membre Déjà Vérifié';
        embedColor = '#3498DB';
        iconEmoji = 'ℹ️';
    } else if (normalizedAction.includes('expir') || normalizedAction.includes('timeout')) {
        title = '⏰ [Captcha] Délai Expiré';
        embedColor = '#ED4245';
        iconEmoji = '⏰';
    }

    const member = options.member || null;
    const user = options.user || member?.user || null;
    const userId = options.userId || user?.id || member?.id || null;
    const username = options.username || user?.tag || user?.username || member?.displayName || 'Membre Inconnu';
    const avatarUrl = user?.displayAvatarURL?.({ size: 256 }) || member?.displayAvatarURL?.({ size: 256 }) || null;

    const channel = options.channel || null;
    const channelId = options.channelId || channel?.id || null;
    const channelName = options.channelName || channel?.name || null;

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(title)
        .setDescription(`>>> ${message}`)
        .setTimestamp();

    if (user || member) {
        embed.setAuthor({
            name: username,
            iconURL: avatarUrl || undefined
        });
        if (avatarUrl) {
            embed.setThumbnail(avatarUrl);
        }
    } else if (guild?.iconURL?.()) {
        embed.setThumbnail(guild.iconURL());
    }

    const fields = [];

    // 1. Membre ciblé
    if (userId) {
        fields.push({
            name: '👤 Membre',
            value: `<@${userId}>\n\`${username}\` (ID: \`${userId}\`)`,
            inline: true
        });
    }

    // 2. Salon temporaire
    if (channelId || channelName) {
        fields.push({
            name: '💬 Salon Dédié',
            value: channelId ? `<#${channelId}>\n\`#${channelName || channelId}\`` : `\`#${channelName}\``,
            inline: true
        });
    }

    // 3. Question posée
    if (options.question) {
        fields.push({
            name: '🧮 Calcul Posé',
            value: `**${options.question}**`,
            inline: true
        });
    }

    // 4. Réponse soumise
    if (options.userAnswer !== undefined) {
        fields.push({
            name: '🎯 Réponse Fournie',
            value: `\`${options.userAnswer}\``,
            inline: true
        });
    }

    // 5. Tentatives
    if (options.attempts !== undefined) {
        const maxAttempts = options.maxAttempts || 3;
        fields.push({
            name: '🔢 Tentatives',
            value: `**${options.attempts}** / **${maxAttempts}**${options.remaining !== undefined ? ` (${options.remaining} restante(s))` : ''}`,
            inline: true
        });
    }

    // 6. Rôle attribué
    if (options.role) {
        const roleId = typeof options.role === 'object' ? options.role.id : options.role;
        const roleName = typeof options.role === 'object' ? options.role.name : null;
        fields.push({
            name: '🛡️ Rôle Donné',
            value: roleId ? `<@&${roleId}>${roleName ? ` (\`${roleName}\`)` : ''}` : 'Rôle Membre Vérifié',
            inline: true
        });
    }

    // 7. Délai / Expiration
    if (options.timeoutMinutes) {
        fields.push({
            name: '⏱️ Délai de Réponse',
            value: `**${options.timeoutMinutes} minutes**`,
            inline: true
        });
    }

    // 8. Motif de kick/échec
    if (options.reason) {
        fields.push({
            name: '📋 Motif',
            value: options.reason,
            inline: false
        });
    }

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    embed.setFooter({
        text: 'Sécurité & Captcha • Chienne Bot',
        iconURL: guild?.iconURL?.() || undefined
    });

    // Action Row interactive avec boutons d'information
    let row = null;
    const buttons = [];

    if (userId) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`btn_captcha_user_${userId.slice(-6)}`)
                .setLabel(`ID: ${userId}`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔍')
                .setDisabled(true)
        );
    }

    if (channelName) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`btn_captcha_chan_${(channelId || '0').slice(-6)}`)
                .setLabel(`#${channelName}`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('💬')
                .setDisabled(true)
        );
    }

    const currentConfig = getConfig ? getConfig() : config;
    const webPort = currentConfig.web?.port || process.env.PORT || 3000;
    const webDomain = currentConfig.web?.domain || process.env.DASHBOARD_URL || null;
    if (webDomain) {
        const dashboardUrl = webDomain.startsWith('http') ? `${webDomain}/modules/captcha/logs` : `https://${webDomain}/modules/captcha/logs`;
        buttons.push(
            new ButtonBuilder()
                .setLabel('Logs Dashboard')
                .setStyle(ButtonStyle.Link)
                .setURL(dashboardUrl)
                .setEmoji('📊')
        );
    }

    if (buttons.length > 0) {
        row = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
    }

    return { embed, row };
}

/**
 * Envoyer un log dans le canal de logs captcha
 * @param {object} guild - L'objet Guild de Discord.js
 * @param {string} action - L'action à logger (ex: "Création canal", "Succès captcha", "Tentative échouée", etc.)
 * @param {string|object} messageOrOptions - Le message de log ou un objet d'options complet
 * @param {string} color - La couleur de l'embed (optionnel)
 * @param {object} options - Options détaillées supplémentaires (optionnel)
 */
async function sendCaptchaLog(guild, action, messageOrOptions, color = '#5865F2', options = {}) {
    let message = '';
    let mergedOptions = {};

    if (typeof messageOrOptions === 'object' && messageOrOptions !== null) {
        mergedOptions = { ...messageOrOptions };
        message = mergedOptions.message || mergedOptions.description || action;
    } else {
        message = String(messageOrOptions || '');
        mergedOptions = { ...options };
    }

    const targetChannelId = mergedOptions.logChannelId || CAPTCHA_CONFIG.CAPTCHA_LOG_CHANNEL || 'mock_channel_id';

    if (!targetChannelId || !guild) {
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
        return null;
    }

    try {
        const logChannel = await guild.channels.fetch(targetChannelId).catch(() => null);

        if (!logChannel || !logChannel.isTextBased()) {
            console.log(`[CAPTCHA LOG] ${action}: ${message}`);
            return null;
        }

        const { embed, row } = buildCaptchaLogEmbed(action, message, color, mergedOptions, guild);

        const payload = { embeds: [embed] };
        if (row) {
            payload.components = [row];
        }

        const sent = await logChannel.send(payload);
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
        return sent;
    } catch (error) {
        console.error('❌ Erreur envoi log captcha:', error.message);
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
        return null;
    }
}

module.exports = { sendCaptchaLog, buildCaptchaLogEmbed };
