/**
 * src/modules/util_autofeeds/services/autofeeds.service.js
 *
 * Service métier pour les flux automatiques multi-sources (RSS, LootScraper, YouTube, Reddit, etc.)
 * avec gestion des catégories, tags, souscriptions utilisateurs et notifications.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { AutofeedsRepository } = require('./autofeeds.repository.js');
const { AutofeedsSubscriptionService } = require('./autofeeds-subscription.service.js');
const { providerRegistry } = require('./providers/provider-registry.js');
const { PRESETS } = require('../config/presets.js');
const logger = require('../../../utils/logger.js');

class AutofeedsService {
    static inject = [AutofeedsRepository, AutofeedsSubscriptionService];

    constructor(repo, subService) {
        this.repo = repo;
        this.subService = subService;
        this._intervalTimer = null;
        this._client = null;
    }

    /**
     * Méthode de compatibilité descendante avec les anciens tests.
     */
    parseFeedXml(xml) {
        const rssProvider = providerRegistry.get('rss');
        return rssProvider.parseXmlFallback(xml);
    }

    /**
     * Ajoute un nouveau flux automatique.
     */
    async addFeed({
        guildId,
        channelId,
        feedUrl,
        name = null,
        feedType = null,
        category = 'general',
        tags = [],
        filters = {},
        customMessage = null,
        color = '#FF4500',
        pingRoleId = null,
        intervalMinutes = 15
    }) {
        if (!guildId || !channelId || !feedUrl) {
            return { ok: false, error: 'Paramètres manquants (salon, URL du flux).' };
        }

        // Détection automatique du fournisseur si non spécifié
        const providerName = feedType || providerRegistry.detectProvider(feedUrl);
        const provider = providerRegistry.get(providerName);
        const resolvedUrl = provider.resolveUrl(feedUrl);

        try {
            new URL(resolvedUrl);
        } catch {
            return { ok: false, error: 'URL de flux invalide.' };
        }

        // Normaliser les tags
        let parsedTags = Array.isArray(tags) ? tags : [];
        if (typeof tags === 'string') {
            parsedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        }

        const feed = await this.repo.addFeed({
            guildId,
            channelId,
            feedUrl: resolvedUrl,
            name: name ? name.trim() : null,
            feedType: providerName,
            category: (category || 'general').trim().toLowerCase(),
            tags: parsedTags,
            filters: filters || {},
            customMessage,
            color: color || '#FF4500',
            pingRoleId,
            intervalMinutes: Math.max(5, parseInt(intervalMinutes, 10) || 15)
        });

        logger.info(`Autofeed ${feed.id} (${providerName}) ajouté pour ${resolvedUrl} sur guilde ${guildId}`, 'AUTOFEEDS');
        return { ok: true, data: feed };
    }

    /**
     * Installe un preset en 1-clic (ex: LootScraper Epic, Steam, etc.).
     */
    async installPreset(guildId, channelId, presetId, options = {}) {
        const preset = PRESETS.find(p => p.id === presetId);
        if (!preset) {
            return { ok: false, error: `Preset "${presetId}" introuvable.` };
        }

        return this.addFeed({
            guildId,
            channelId,
            feedUrl: preset.feedUrl,
            name: preset.name,
            feedType: preset.provider || 'rss',
            category: preset.category || 'gaming',
            tags: preset.tags || [],
            color: preset.color || '#FEE75C',
            intervalMinutes: options.intervalMinutes || 15,
            customMessage: options.customMessage || null
        });
    }

    async getFeed(id) {
        return this.repo.getFeedById(id);
    }

    async listFeeds(guildId) {
        return this.repo.listByGuild(guildId);
    }

    async updateFeed(id, patch) {
        const updated = await this.repo.updateFeed(id, patch);
        if (!updated) {
            return { ok: false, error: 'Flux introuvable.' };
        }
        return { ok: true, data: updated };
    }

    async deleteFeed(id) {
        await this.repo.deleteFeed(id);
        return { ok: true };
    }

    /**
     * Génère l'embed Discord riche pour un article de flux.
     */
    buildDiscordEmbed(feed, item) {
        const color = typeof feed.color === 'string'
            ? parseInt(feed.color.replace('#', ''), 16) || 0xFF4500
            : 0xFF4500;

        const provider = providerRegistry.get(feed.feedType);
        const sourceIcon = provider?.icon || '📰';
        const sourceLabel = feed.name || provider?.label || 'Flux RSS';

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${sourceIcon} ${item.title.slice(0, 250)}`)
            .setURL(item.link || feed.feedUrl)
            .setTimestamp(new Date(item.publishedAt));

        if (item.content) {
            embed.setDescription(item.content);
        }

        if (item.imageUrl) {
            embed.setImage(item.imageUrl);
        }

        // Champs de métadonnées
        const fields = [];
        if (feed.category && feed.category !== 'general') {
            fields.push({ name: '📁 Catégorie', value: `\`${feed.category.toUpperCase()}\``, inline: true });
        }

        if (item.author) {
            fields.push({ name: '✍️ Auteur', value: item.author, inline: true });
        }

        const combinedTags = Array.from(new Set([...(feed.tags || []), ...(item.tags || [])]));
        if (combinedTags.length > 0) {
            const formattedTags = combinedTags.slice(0, 6).map(t => `\`#${t}\``).join(' ');
            fields.push({ name: '🏷️ Tags', value: formattedTags, inline: false });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        embed.setFooter({ text: `${sourceLabel} • ${feed.category || 'actualités'}` });

        return embed;
    }

    /**
     * Génère la ligne d'action Discord avec bouton de lien direct et souscription rapide.
     */
    buildActionRow(feed, item) {
        const row = new ActionRowBuilder();

        // 1. Bouton Lien direct vers l'article
        if (item.link && (item.link.startsWith('http://') || item.link.startsWith('https://'))) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel("Voir l'article")
                    .setEmoji('🔗')
                    .setStyle(ButtonStyle.Link)
                    .setURL(item.link)
            );
        }

        // 2. Bouton Souscription au tag principal s'il y en a un
        const primaryTag = (feed.tags && feed.tags[0]) || (item.tags && item.tags[0]) || feed.category || null;
        if (primaryTag) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`autofeed:sub:tag:${primaryTag.toLowerCase()}`)
                    .setLabel(`Suivre #${primaryTag}`)
                    .setEmoji('🔔')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        return row.components.length > 0 ? row : null;
    }

    /**
     * Analyse et publie les nouveaux articles d'un flux spécifique.
     */
    async _checkSingleFeed(feed, client) {
        try {
            const provider = providerRegistry.get(feed.feedType);
            const items = await provider.fetchItems(feed);
            if (!items || items.length === 0) return;

            // Filtrer par filtres de mots-clés
            const filteredItems = items.filter(it => provider.matchesFilters(it, feed.filters));

            // Filtrer les nouveaux articles : date plus récente et pas encore présent dans l'historique
            const newItems = [];
            for (const item of filteredItems) {
                if (item.publishedAt > feed.lastItemPublishedAt && item.id !== feed.lastItemId) {
                    const alreadyPosted = await this.repo.hasItemBeenPosted(feed.id, item.id);
                    if (!alreadyPosted) {
                        newItems.push(item);
                    }
                }
            }

            // Trier du plus ancien au plus récent
            newItems.sort((a, b) => a.publishedAt - b.publishedAt);
            if (newItems.length === 0) return;

            // Prendre le plus récent pour la mise à jour de la date
            const latest = newItems[newItems.length - 1];

            // Limiter à 5 articles simultanés max pour éviter le spam lors d'une première activation
            const toPost = newItems.slice(-5);

            if (client && client.channels) {
                const channel = client.channels.cache.get(feed.channelId) || await client.channels.fetch(feed.channelId).catch(() => null);

                if (channel && channel.send) {
                    for (const item of toPost) {
                        const embed = this.buildDiscordEmbed(feed, item);
                        const actionRow = this.buildActionRow(feed, item);

                        // Détecter les souscripteurs à notifier
                        const { mentionUserIds, dmUserIds } = await this.subService.findMatchingSubscribers(feed.guildId, feed, item);

                        // Construire le message texte (mentions + ping de rôle)
                        const pings = [];
                        if (feed.pingRoleId) {
                            pings.push(`<@&${feed.pingRoleId}>`);
                        }
                        if (mentionUserIds.length > 0) {
                            pings.push(mentionUserIds.map(uid => `<@${uid}>`).join(' '));
                        }

                        let messageContent = '';
                        if (feed.customMessage) {
                            messageContent = feed.customMessage
                                .replace('{title}', item.title)
                                .replace('{link}', item.link || '')
                                .replace('{mentions}', pings.join(' '));
                        } else if (pings.length > 0) {
                            messageContent = `🔔 ${pings.join(' ')}`;
                        }

                        const sendPayload = {
                            embeds: [embed]
                        };
                        if (messageContent.trim()) {
                            sendPayload.content = messageContent;
                        }
                        if (actionRow) {
                            sendPayload.components = [actionRow];
                        }

                        // Envoi dans le salon Discord
                        await channel.send(sendPayload).catch(err => {
                            logger.warn(`[Autofeeds] Erreur envoi channel ${feed.channelId}: ${err.message}`, 'AUTOFEEDS');
                        });

                        // Envoi des notifications privées en DM
                        if (dmUserIds.length > 0) {
                            for (const dmUid of dmUserIds) {
                                try {
                                    const user = await client.users.fetch(dmUid).catch(() => null);
                                    if (user && user.send) {
                                        await user.send({
                                            content: `🔔 Nouvel article correspondant à vos abonnements sur le serveur :`,
                                            embeds: [embed],
                                            components: actionRow ? [actionRow] : []
                                        }).catch(() => {});
                                    }
                                } catch {}
                            }
                        }

                        // Enregistrement dans l'historique anti-doublon
                        await this.repo.recordPostedItem(feed.id, item.id, item.link, item.title);
                    }
                }
            }

            await this.repo.updateLastItem(feed.id, latest.id, latest.publishedAt);
        } catch (err) {
            logger.warn(`Erreur check feed ${feed.id}: ${err.message}`, 'AUTOFEEDS');
        }
    }

    /**
     * Teste et extrait les éléments d'un flux sans impacter l'historique.
     */
    async testFeed(feedId) {
        const feed = await this.repo.getFeedById(feedId);
        if (!feed) {
            return { ok: false, error: 'Flux introuvable.' };
        }

        const provider = providerRegistry.get(feed.feedType);
        const items = await provider.fetchItems(feed);
        if (!items || items.length === 0) {
            return { ok: false, error: 'Aucun article trouvé sur ce flux.' };
        }

        const latest = items[0];
        const embed = this.buildDiscordEmbed(feed, latest);

        return {
            ok: true,
            data: {
                itemCount: items.length,
                latestItem: latest,
                previewEmbed: embed.toJSON()
            }
        };
    }

    /**
     * Cycle de scrutation de tous les flux actifs.
     */
    async pollFeeds(client) {
        try {
            const feeds = await this.repo.listAllActive();
            for (const feed of feeds) {
                await this._checkSingleFeed(feed, client || this._client);
            }
        } catch (err) {
            logger.warn(`Erreur pollFeeds: ${err.message}`, 'AUTOFEEDS');
        }
    }

    start(client) {
        this._client = client;
        if (this._intervalTimer) return;
        this._intervalTimer = setInterval(() => {
            this.pollFeeds(client).catch(() => {});
        }, 5 * 60 * 1000); // Scrutation toutes les 5 minutes
    }

    stop() {
        if (this._intervalTimer) {
            clearInterval(this._intervalTimer);
            this._intervalTimer = null;
        }
    }
}

Injectable()(AutofeedsService);

module.exports = { AutofeedsService };
