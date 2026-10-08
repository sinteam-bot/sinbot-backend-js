/**
 * src/modules/util_autofeeds/services/autofeeds-webhook.service.js
 *
 * Service de gestion des webhooks Discord personnalisés pour la diffusion des flux.
 * Permet d'emprunter dynamiquement le nom et l'avatar de la source/streamer.
 */

const { logger } = require('../../../utils/logger.js');
const { Injectable } = require('../../../core/index.js');

class AutofeedsWebhookService {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Récupère ou crée un webhook Discord dédié dans le salon cible.
     * @param {Object} channel - Channel Discord.js
     * @param {Object} client - Discord Client
     * @returns {Promise<Object|null>} Discord Webhook instance ou null
     */
    async getOrCreateWebhook(channel, client = null) {
        if (!channel || typeof channel.fetchWebhooks !== 'function' || typeof channel.createWebhook !== 'function') {
            return null;
        }

        const channelId = channel.id;
        if (this.cache.has(channelId)) {
            const cached = this.cache.get(channelId);
            if (cached) {
                return cached;
            }
        }

        try {
            const webhooks = await channel.fetchWebhooks().catch(() => null);
            let targetWebhook = null;

            if (webhooks) {
                if (typeof webhooks.find === 'function') {
                    targetWebhook = webhooks.find(wh => !client?.user?.id || wh.owner?.id === client.user.id);
                } else if (webhooks instanceof Map || typeof webhooks.values === 'function') {
                    for (const wh of webhooks.values()) {
                        if (!client?.user?.id || wh.owner?.id === client.user.id) {
                            targetWebhook = wh;
                            break;
                        }
                    }
                }
            }

            if (!targetWebhook) {
                targetWebhook = await channel.createWebhook({
                    name: 'ChienneBot-Autofeeds',
                    avatar: client?.user?.displayAvatarURL?.() || null,
                    reason: 'Diffusion automatique des flux avec identité personnalisée'
                }).catch(() => null);
            }

            if (targetWebhook) {
                this.cache.set(channelId, targetWebhook);
                return targetWebhook;
            }
        } catch (err) {
            logger.warn(`[AutofeedsWebhookService] Impossible de gérer les webhooks sur le salon ${channel.id}: ${err.message}`, 'AUTOFEEDS_WH');
        }

        return null;
    }

    /**
     * Tente d'envoyer un message via webhook avec le nom et l'avatar de la source.
     */
    async sendViaWebhook(channel, clientOrPayload, payloadOrFeed, feedOrOptions, maybeItem) {
        let client = null;
        let sendPayload = null;
        let feed = null;
        let item = null;

        if (clientOrPayload && (clientOrPayload.channels || clientOrPayload.user)) {
            client = clientOrPayload;
            sendPayload = payloadOrFeed;
            feed = feedOrOptions;
            item = maybeItem || {};
        } else {
            sendPayload = clientOrPayload;
            const options = payloadOrFeed || {};
            feed = {
                useWebhook: true,
                name: options.name || options.username || 'Flux Actu'
            };
            item = {
                author: options.name || options.username || 'Flux Actu',
                avatarUrl: options.avatar || options.avatarURL || null
            };
        }

        if (!feed || feed.useWebhook === false) {
            return false;
        }

        const webhook = await this.getOrCreateWebhook(channel, client);
        if (!webhook) {
            return false;
        }

        try {
            let authorName = (item.author || feed.name || 'Flux Actu').slice(0, 80);
            let avatarURL = item.avatarUrl || item.extra?.avatarUrl || null;

            const webhookPayload = {
                ...sendPayload,
                username: authorName
            };

            if (avatarURL && (avatarURL.startsWith('http://') || avatarURL.startsWith('https://'))) {
                webhookPayload.avatarURL = avatarURL;
            }

            const sent = await webhook.send(webhookPayload);
            return sent || true;
        } catch (err) {
            logger.warn(`[AutofeedsWebhookService] Échec envoi webhook (${err.message}), bascule sur channel.send()`, 'AUTOFEEDS_WH');
            return false;
        }
    }
}

Injectable()(AutofeedsWebhookService);

module.exports = { AutofeedsWebhookService };
