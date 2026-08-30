const CAPTCHA_CONFIG = require('./captcha.config.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { config, getConfig } = require('../../config/index.js');

/**
 * Cache en mémoire des messageId des logs Captcha en cours.
 * Clé = `${guildId}:${userId}` (un seul log "live" par membre).
 * Vidée quand le bot redémarre — dans ce cas, un nouveau log est créé.
 * @type {Map<string, string>}
 */
const _liveLogCache = new Map();

function _cacheKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

/**
 * Construit un Embed riche et interactif pour les logs Captcha
 * @param {string} action - L'action à logger
 * @param {string} message - Le message descriptif
 * @param {string} color - La couleur de l'embed
 * @param {object} options - Options détaillées (member, channel, question, attempts, etc.)
 * @param {object} guild - La guilde Discord
 * @param {Array} steps - Liste des étapes déjà effectuées (pour l'historique)
 * @returns {{ embed: EmbedBuilder, row: ActionRowBuilder|null }}
 */
function buildCaptchaLogEmbed(action, message, color = '#5865F2', options = {}, guild = null, steps = []) {
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
    } else if (normalizedAction.includes('tentative') || normalizedAction.includes('incorrect') || normalizedAction.includes('échouée') || normalizedAction.includes('echouee')) {
        // "Tentative échouée" et "Réponse Incorrecte" : on les unifie sous
        // "Réponse Incorrecte" pour éviter 3 messages séparés.
        title = '⚠️ [Captcha] Réponse Incorrecte';
        embedColor = '#FEE75C';
        iconEmoji = '⚠️';
    }

    const member = options.member || null;
    const user = options.user || member?.user || null;
    const userId = options.userId || user?.id || member?.id || null;
    const username = options.username || user?.tag || user?.username || member?.displayName || 'Membre Inconnu';
    const avatarUrl = user?.displayAvatarURL?.({ size: 256 }) || member?.displayAvatarURL?.({ size: 256 }) || null;

    const channel = options.channel || null;
    const channelId = options.channelId || channel?.id || null;
    const channelName = options.channelName || channel?.name || null;

    // Description = message actuel + historique condensé
    let description = `>>> ${message}`;
    if (steps.length > 1) {
        const history = steps
            .slice(0, -1) // tout sauf l'étape courante
            .map((s, idx) => `**${idx + 1}.** ${s.icon} ${s.action}${s.detail ? ` — ${s.detail}` : ''}`)
            .join('\n');
        description = `${history}\n\n>>> ${message}`;
    }

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(title)
        .setDescription(description)
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

    // 4. Réponse soumise (dernière uniquement, l'historique est dans la description)
    if (options.userAnswer !== undefined) {
        fields.push({
            name: '🎯 Dernière Réponse',
            value: `\`${options.userAnswer}\``,
            inline: true
        });
    }

    // 5. Tentatives (cumul)
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
        text: steps.length > 1
            ? `Sécurité & Captcha · ${steps.length} étape${steps.length > 1 ? 's' : ''}`
            : 'Sécurité & Captcha',
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
 * Renvoie l'icône correspondant à l'action (pour l'historique)
 */
function _iconForAction(action) {
    const a = (action || '').toLowerCase();
    if (a.includes('création') || a.includes('creation')) return '🛡️';
    if (a.includes('succès') || a.includes('succes') || a.includes('validé')) return '✅';
    if (a.includes('kick') || a.includes('expuls')) return '🚫';
    if (a.includes('déjà') || a.includes('deja')) return 'ℹ️';
    if (a.includes('expir') || a.includes('timeout')) return '⏰';
    if (a.includes('tentative') || a.includes('incorrect') || a.includes('échouée') || a.includes('echouee')) return '⚠️';
    return '⚡';
}

/**
 * Envoyer (ou mettre à jour) un log dans le canal de logs captcha.
 * Pour un même (guildId, userId), les logs successifs éditent le premier
 * message au lieu d'en créer un nouveau.
 *
 * @param {object} guild - L'objet Guild de Discord.js
 * @param {string} action - L'action à logger
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

    let targetChannelId = mergedOptions.logChannelId;
    if (!targetChannelId && guild?.id) {
        try {
            const { getFeatureConfig } = require('../../config/c12-loader.js');
            const cfg = await getFeatureConfig(guild.id, 'captcha');
            targetChannelId = cfg?.log_channel_id ?? cfg?.channel_id;
        } catch {}
    }
    if (!targetChannelId) {
        targetChannelId = CAPTCHA_CONFIG.log_channel_id || CAPTCHA_CONFIG.CAPTCHA_LOG_CHANNEL;
    }
    if (!targetChannelId && process.env.NODE_ENV === 'test') {
        targetChannelId = 'mock_channel_id';
    }

    const userId = mergedOptions.userId || mergedOptions.user?.id || mergedOptions.member?.id || null;

    if (!targetChannelId || !guild) {
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
        return null;
    }

    // Récupère l'historique des étapes pour ce (guild, user)
    const cacheKey = _cacheKey(guild.id, userId || 'global');
    if (!_liveLogCache.has(cacheKey)) {
        _liveLogCache.set(cacheKey, { messageId: null, steps: [] });
    }
    const state = _liveLogCache.get(cacheKey);

    // Construit l'étape courante
    const icon = _iconForAction(action);
    const stepDetail = mergedOptions.attempts !== undefined
        ? `tentative ${mergedOptions.attempts}/${mergedOptions.maxAttempts || 3}${mergedOptions.userAnswer !== undefined ? ` (réponse: \`${mergedOptions.userAnswer}\`)` : ''}`
        : (mergedOptions.userAnswer !== undefined ? `réponse: \`${mergedOptions.userAnswer}\`` : '');
    state.steps.push({ action, icon, detail: stepDetail });

    // Si l'action est terminale (succès, kick, expiration, déjà), on ferme le log
    const isTerminal = /(succès|succes|validé|kick|expuls|expir|timeout|déjà|deja)/i.test(action);
    const keepAlive = !isTerminal; // garder en cache tant que non terminal

    try {
        const logChannel = await guild.channels.fetch(targetChannelId).catch(() => null);
        if (!logChannel || !logChannel.isTextBased()) {
            console.log(`[CAPTCHA LOG] ${action}: ${message}`);
            return null;
        }

        const { embed, row } = buildCaptchaLogEmbed(
            action, message, color, mergedOptions, guild, state.steps
        );

        let sent;
        if (state.messageId) {
            // Tente d'éditer le message existant
            try {
                const existing = await logChannel.messages.fetch(state.messageId);
                if (existing) {
                    const payload = { embeds: [embed] };
                    if (row) payload.components = [row];
                    sent = await existing.edit(payload);
                } else {
                    state.messageId = null;
                }
            } catch (e) {
                // Le message a été supprimé ou inaccessible : on en crée un nouveau
                state.messageId = null;
            }
        }

        if (!state.messageId) {
            // Premier log (ou fallback après suppression) : on envoie
            const payload = { embeds: [embed] };
            if (row) payload.components = [row];
            sent = await logChannel.send(payload);
            state.messageId = sent.id;
        }

        // Si l'action est terminale, on libère le cache après un délai
        // (laisser 5 min pour d'éventuels logs liés au même user)
        if (!keepAlive) {
            setTimeout(() => {
                _liveLogCache.delete(cacheKey);
            }, 5 * 60 * 1000);
        }

        console.log(`[CAPTCHA LOG] ${action} (live log for ${cacheKey})${state.messageId ? ` → msg ${state.messageId}` : ''}: ${message}`);
        return sent;
    } catch (error) {
        console.error('❌ Erreur envoi log captcha:', error.message);
        console.log(`[CAPTCHA LOG] ${action}: ${message}`);
        return null;
    }
}

/**
 * Vide le cache des logs live (utile pour les tests).
 */
function _clearLiveLogCache() {
    _liveLogCache.clear();
}

module.exports = { sendCaptchaLog, buildCaptchaLogEmbed, _clearLiveLogCache };
