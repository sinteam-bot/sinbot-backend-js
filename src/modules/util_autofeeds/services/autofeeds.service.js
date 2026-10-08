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
        subscriberRoleId = null,
        notificationDelivery = 'channel',
        createThread = false,
        threadAutoArchiveDuration = 1440,
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

        // Résolution de l'intervalle selon le type de plateforme
        let resolvedInterval = parseInt(intervalMinutes, 10);
        if (isNaN(resolvedInterval) || resolvedInterval <= 0) {
            if (provider?.isLive) {
                resolvedInterval = 2; // Lives : 2 minutes
            } else if (['youtube', 'tiktok', 'social_bridge'].includes(providerName)) {
                resolvedInterval = 15; // Vidéos & réseaux : 15 minutes
            } else {
                resolvedInterval = 30; // RSS / Presse : 30 minutes
            }
        } else {
            resolvedInterval = Math.max(provider?.isLive ? 2 : 5, resolvedInterval);
        }

        // Palette de couleurs par défaut selon la plateforme
        let resolvedColor = color;
        if (!resolvedColor || resolvedColor === '#FF4500') {
            if (providerName === 'twitch') resolvedColor = '#9146FF';
            else if (providerName === 'kick') resolvedColor = '#53FC18';
            else if (providerName === 'youtube_live' || providerName === 'youtube') resolvedColor = '#FF0000';
            else resolvedColor = '#FF4500';
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
            color: resolvedColor,
            pingRoleId,
            subscriberRoleId,
            notificationDelivery,
            createThread,
            threadAutoArchiveDuration,
            intervalMinutes: resolvedInterval
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

        if (item.extra?.game || item.extra?.category) {
            fields.push({ name: '🎮 Jeu / Catégorie', value: `\`${item.extra.game || item.extra.category}\``, inline: true });
        }
        if (item.extra?.viewers != null) {
            fields.push({ name: '👥 Spectateurs', value: `\`${Number(item.extra.viewers).toLocaleString('fr-FR')}\``, inline: true });
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
        const provider = providerRegistry.get(feed.feedType);

        // 1. Bouton Lien direct vers le contenu ou live
        if (item.link && (item.link.startsWith('http://') || item.link.startsWith('https://'))) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel(provider?.isLive ? "🔴 Regarder le Live" : "Voir l'article")
                    .setEmoji(provider?.isLive ? '🔴' : '🔗')
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

        // 3. Bouton Souscription au créateur/auteur s'il est spécifié
        if (item.author) {
            const authorClean = item.author.replace('@', '').trim();
            if (authorClean && (!primaryTag || authorClean.toLowerCase() !== primaryTag.toLowerCase())) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`autofeed:sub:author:${authorClean.toLowerCase().slice(0, 40)}`)
                        .setLabel(`Suivre @${authorClean.slice(0, 20)}`)
                        .setEmoji('👤')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
        }

        return row.components.length > 0 ? row : null;
    }

    /**
     * Analyse et publie les nouveaux articles d'un flux spécifique.
     */
    async _checkSingleFeed(feed, client, force = false) {
        const now = Date.now();
        const intervalMs = (feed.intervalMinutes || 15) * 60 * 1000;

        // Respect de l'intervalle individuel sauf si forcé
        if (!force && feed.lastCheckedAt && (now - feed.lastCheckedAt < intervalMs)) {
            return;
        }

        try {
            const provider = providerRegistry.get(feed.feedType);
            const isLiveFeed = Boolean(provider?.isLive);
            const items = await provider.fetchItems(feed);

            if (!items || items.length === 0) {
                // Si c'est un flux de stream en direct et qu'il était en live, gérer la fin de diffusion
                if (isLiveFeed) {
                    await this._handleLiveStreamOffline(feed, client, provider);
                }
                await this.repo.recordFeedCheckResult(feed.id, { status: 'ok' });
                return;
            }

            // Gestion spécialisée pour les diffusions en direct
            if (isLiveFeed) {
                await this._handleLiveStreamOnline(feed, client, provider, items[0]);
                await this.repo.recordFeedCheckResult(feed.id, {
                    status: 'ok',
                    lastItemId: items[0].id,
                    lastItemPublishedAt: items[0].publishedAt || now
                });
                return;
            }

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

            if (newItems.length === 0) {
                await this.repo.recordFeedCheckResult(feed.id, { status: 'ok' });
                return;
            }

            // Prendre le plus récent pour la mise à jour de la date
            const latest = newItems[newItems.length - 1];

            // Limiter à 5 articles simultanés max pour éviter le spam lors d'une première activation
            const toPost = newItems.slice(-5);

            if (client && client.channels) {
                const channel = client.channels.cache?.get(feed.channelId) 
                    || (client.channels.fetch ? await client.channels.fetch(feed.channelId).catch(() => null) : null);

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
                                .replace(/{title}/gi, item.title)
                                .replace(/{link}/gi, item.link || '')
                                .replace(/{url}/gi, item.link || '')
                                .replace(/{author}/gi, item.author || '')
                                .replace(/{mentions}/gi, pings.join(' '));
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
                                    const user = client.users?.fetch ? await client.users.fetch(dmUid).catch(() => null) : null;
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

            await this.repo.recordFeedCheckResult(feed.id, {
                status: 'ok',
                lastItemId: latest.id,
                lastItemPublishedAt: latest.publishedAt
            });
        } catch (err) {
            logger.warn(`Erreur check feed ${feed.id}: ${err.message}`, 'AUTOFEEDS');
            const checkRes = await this.repo.recordFeedCheckResult(feed.id, {
                status: 'error',
                error: err.message
            });
            if (checkRes) {
                if (checkRes.failCount === 3) {
                    await this._sendAdminLogAlert(feed, client, {
                        type: 'warning',
                        failCount: 3,
                        error: err.message
                    });
                } else if (checkRes.autoDisabled) {
                    await this._sendAdminLogAlert(feed, client, {
                        type: 'disabled',
                        failCount: checkRes.failCount,
                        error: err.message
                    });
                }
            }
        }
    }

    /**
     * Envoie une alerte dans les logs Discord (3 échecs consécutifs ou désactivation auto à 10 échecs).
     */
    async _sendAdminLogAlert(feed, client, { type, failCount, error }) {
        if (!client || !feed) return;
        try {
            const { getConfig } = require('../../../config/index.js');
            const { getFeatureConfig } = require('../../../config/c12-loader.js');
            const guildCfg = await getFeatureConfig(feed.guildId, 'autofeeds').catch(() => ({}));
            const globalCfg = getConfig().autofeeds || {};
            const logChannelId = guildCfg.log_channel_id || globalCfg.log_channel_id;

            let logChannel = null;
            if (logChannelId && client.channels) {
                logChannel = client.channels.cache?.get(logChannelId)
                    || (client.channels.fetch ? await client.channels.fetch(logChannelId).catch(() => null) : null);
            }
            if (!logChannel && client.guilds) {
                const guild = client.guilds.cache?.get(feed.guildId)
                    || (client.guilds.fetch ? await client.guilds.fetch(feed.guildId).catch(() => null) : null);
                if (guild) {
                    logChannel = guild.systemChannel || guild.publicUpdatesChannel || null;
                }
            }

            if (logChannel && logChannel.send) {
                const isDis = type === 'disabled';
                const embed = new EmbedBuilder()
                    .setColor(isDis ? 0xED4245 : 0xFEE75C)
                    .setTitle(isDis ? `🛑 [Autofeeds] Flux désactivé (${feed.name || feed.id})` : `⚠️ [Autofeeds] Erreurs récurrentes (${feed.name || feed.id})`)
                    .setDescription(
                        isDis
                            ? `Le flux **${feed.name || feed.feedUrl}** a rencontré **${failCount} échecs consécutifs** et a été désactivé automatiquement pour préserver les performances.`
                            : `Le flux **${feed.name || feed.feedUrl}** a rencontré **${failCount} échecs consécutifs** lors des vérifications automatiques.`
                    )
                    .addFields(
                        { name: 'URL du flux', value: `\`${feed.feedUrl}\``, inline: false },
                        { name: 'Dernière erreur', value: `\`\`\`${String(error || 'Inconnue').slice(0, 500)}\`\`\``, inline: false }
                    )
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        } catch (alertErr) {
            logger.warn(`[Autofeeds] Impossible d'envoyer l'alerte log: ${alertErr.message}`, 'AUTOFEEDS');
        }
    }

    /**
     * Traite l'ouverture d'une session de live en direct.
     */
    async _handleLiveStreamOnline(feed, client, provider, streamItem) {
        if (!provider.matchesFilters(streamItem, feed.filters)) {
            return;
        }

        const activeSession = await this.repo.getActiveLiveSession(feed.id);
        const streamerName = streamItem.author || feed.name || 'Streamer';
        const gameName = streamItem.extra?.game || streamItem.extra?.category || null;

        // Si une session est déjà en cours, on ne reposte pas de nouvelle alerte
        if (activeSession) {
            return;
        }

        // Vérifier si ce live spécifique a déjà été posté
        const alreadyPosted = await this.repo.hasItemBeenPosted(feed.id, streamItem.id);
        if (alreadyPosted) {
            return;
        }

        if (client && client.channels) {
            const channel = client.channels.cache?.get(feed.channelId) 
                || (client.channels.fetch ? await client.channels.fetch(feed.channelId).catch(() => null) : null);

            if (channel && channel.send) {
                const embed = this.buildDiscordEmbed(feed, streamItem);
                const actionRow = this.buildActionRow(feed, streamItem);

                // Détecter les souscripteurs
                const { mentionUserIds, dmUserIds } = await this.subService.findMatchingSubscribers(feed.guildId, feed, streamItem);

                // Mentions et ping
                const pings = [];
                if (feed.pingRoleId) {
                    pings.push(`<@&${feed.pingRoleId}>`);
                }
                if (feed.subscriberRoleId && feed.subscriberRoleId !== feed.pingRoleId) {
                    pings.push(`<@&${feed.subscriberRoleId}>`);
                }
                if (mentionUserIds.length > 0) {
                    pings.push(mentionUserIds.map(uid => `<@${uid}>`).join(' '));
                }

                const viewersCount = streamItem.extra?.viewers != null ? String(streamItem.extra.viewers) : 'N/C';
                let messageContent = '';
                if (feed.customMessage) {
                    messageContent = feed.customMessage
                        .replace(/{streamer}/gi, streamerName)
                        .replace(/{title}/gi, streamItem.title)
                        .replace(/{game}/gi, gameName || 'Non spécifié')
                        .replace(/{viewers}/gi, viewersCount)
                        .replace(/{url}/gi, streamItem.link || '')
                        .replace(/{link}/gi, streamItem.link || '')
                        .replace(/{mentions}/gi, pings.join(' '));
                } else if (pings.length > 0) {
                    messageContent = `🔴 ${pings.join(' ')}`;
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

                const sentMsg = await channel.send(sendPayload).catch(err => {
                    logger.warn(`[Autofeeds] Erreur envoi live channel ${feed.channelId}: ${err.message}`, 'AUTOFEEDS');
                    return null;
                });

                let threadId = null;
                if (sentMsg?.id) {
                    if (feed.createThread && sentMsg.startThread) {
                        try {
                            const threadTitle = `🔴 Live • ${streamerName.slice(0, 30)} - ${(streamItem.title || 'Discussion').slice(0, 50)}`;
                            const thread = await sentMsg.startThread({
                                name: threadTitle,
                                autoArchiveDuration: feed.threadAutoArchiveDuration || 1440,
                                reason: `Fil de discussion pour le direct de ${streamerName}`
                            }).catch(() => null);
                            if (thread) {
                                threadId = thread.id;
                                if (thread.send) {
                                    await thread.send(`👋 Bienvenue dans le fil de discussion pour le live de **${streamerName}** !`).catch(() => {});
                                }
                            }
                        } catch (threadErr) {
                            logger.warn(`[Autofeeds] Impossible de créer le thread live: ${threadErr.message}`, 'AUTOFEEDS');
                        }
                    }

                    await this.repo.saveLiveSession({
                        feedId: feed.id,
                        streamId: streamItem.id,
                        streamerName,
                        channelId: feed.channelId,
                        messageId: sentMsg.id,
                        threadId,
                        title: streamItem.content || streamItem.title,
                        game: gameName,
                        url: streamItem.link,
                        startedAt: streamItem.publishedAt || Date.now()
                    });
                }

                // Notifications DM
                if (dmUserIds.length > 0) {
                    for (const dmUid of dmUserIds) {
                        try {
                            const user = client.users?.fetch ? await client.users.fetch(dmUid).catch(() => null) : null;
                            if (user && user.send) {
                                await user.send({
                                    content: `🔴 **${streamerName}** est en direct !`,
                                    embeds: [embed],
                                    components: actionRow ? [actionRow] : []
                                }).catch(() => {});
                            }
                        } catch {}
                    }
                }

                await this.repo.recordPostedItem(feed.id, streamItem.id, streamItem.link, streamItem.title);
            }
        }
    }

    /**
     * Traite la fin de diffusion (transition offline in-place sans ghost-ping).
     */
    async _handleLiveStreamOffline(feed, client, provider) {
        const activeSession = await this.repo.getActiveLiveSession(feed.id);
        if (!activeSession) {
            return;
        }

        const endedAt = Date.now();
        const durationMs = Math.max(0, endedAt - activeSession.startedAt);
        const totalMinutes = Math.floor(durationMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const durationStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes} min`;

        if (client && client.channels) {
            try {
                const channel = client.channels.cache?.get(activeSession.channelId) 
                    || (client.channels.fetch ? await client.channels.fetch(activeSession.channelId).catch(() => null) : null);
                if (channel && channel.messages) {
                    const originalMsg = channel.messages.fetch ? await channel.messages.fetch(activeSession.messageId).catch(() => null) : null;
                    if (originalMsg && originalMsg.edit) {
                        const offlineEmbed = new EmbedBuilder()
                            .setColor(0x747F8D)
                            .setTitle(`⚫ [OFFLINE] ${activeSession.streamerName} n'est plus en direct`)
                            .setURL(activeSession.url || feed.feedUrl)
                            .setDescription(`Le live est maintenant terminé. Merci d'avoir suivi la diffusion !`)
                            .addFields(
                                { name: '⏱️ Durée du stream', value: `\`${durationStr}\``, inline: true },
                                { name: '🎮 Dernier jeu/catégorie', value: `\`${activeSession.game || 'Non spécifié'}\``, inline: true }
                            )
                            .setFooter({ text: `${provider?.label || 'Stream'} • Diffusion terminée` })
                            .setTimestamp(new Date(endedAt));

                        const offlineRow = new ActionRowBuilder();
                        if (activeSession.url) {
                            offlineRow.addComponents(
                                new ButtonBuilder()
                                    .setLabel('🎬 Voir la chaîne / Replay')
                                    .setEmoji('🎬')
                                    .setStyle(ButtonStyle.Link)
                                    .setURL(activeSession.url)
                            );
                        }

                        // Édition in-place sans ghost-ping (content vidé)
                        await originalMsg.edit({
                            content: ' ',
                            embeds: [offlineEmbed],
                            components: offlineRow.components.length > 0 ? [offlineRow] : []
                        }).catch(err => {
                            logger.warn(`[Autofeeds] Erreur edit message offline: ${err.message}`, 'AUTOFEEDS');
                        });
                    }
                }

                // Clôture du thread live si existant
                if (activeSession.threadId) {
                    const thread = client.channels.cache?.get(activeSession.threadId)
                        || (client.channels.fetch ? await client.channels.fetch(activeSession.threadId).catch(() => null) : null);
                    if (thread && thread.send) {
                        await thread.send(`⚫ Le direct de **${activeSession.streamerName}** est terminé. Merci à tous d'avoir suivi le live !`).catch(() => {});
                        if (thread.setArchived) {
                            await thread.setArchived(true).catch(() => {});
                        }
                    }
                }
            } catch (err) {
                logger.warn(`[Autofeeds] Erreur clôture session message: ${err.message}`, 'AUTOFEEDS');
            }
        }

        await this.repo.closeLiveSession(activeSession.id, {
            endedAt,
            game: activeSession.game,
            title: activeSession.title
        });
        logger.info(`Session live terminée pour ${activeSession.streamerName} (${durationStr})`, 'AUTOFEEDS');
    }

    /**
     * Traite un événement webhook Twitch EventSub (stream.online / stream.offline).
     */
    async handleTwitchEventSub(eventType, eventData, client) {
        const username = (eventData?.broadcaster_user_login || eventData?.broadcaster_user_name || '').toLowerCase();
        if (!username) return { ok: false, error: 'Nom de streamer manquant.' };

        const allFeeds = await this.repo.listAllActive();
        const twitchProv = providerRegistry.get('twitch');
        const matchingFeeds = allFeeds.filter(f => {
            if (f.feedType !== 'twitch') return false;
            return twitchProv.extractUsername(f.feedUrl) === username;
        });

        if (matchingFeeds.length === 0) {
            return { ok: true, matched: 0 };
        }

        for (const feed of matchingFeeds) {
            if (eventType === 'stream.online') {
                const streamItem = {
                    id: `twitch:${username}:${eventData.id || Date.now()}`,
                    title: `🔴 [LIVE] ${eventData.broadcaster_user_name || username} est en direct sur Twitch !`,
                    content: eventData.title || 'Diffusion en direct sur Twitch',
                    link: `https://www.twitch.tv/${username}`,
                    author: eventData.broadcaster_user_name || username,
                    imageUrl: null,
                    publishedAt: eventData.started_at ? new Date(eventData.started_at).getTime() : Date.now(),
                    tags: ['twitch', 'live', 'stream', username],
                    extra: {
                        game: null,
                        viewers: null
                    }
                };
                await this._handleLiveStreamOnline(feed, client || this._client, twitchProv, streamItem);
            } else if (eventType === 'stream.offline') {
                await this._handleLiveStreamOffline(feed, client || this._client, twitchProv);
            }
        }

        return { ok: true, matched: matchingFeeds.length };
    }

    /**
     * Traite une notification WebSub YouTube (nouveau contenu ou live).
     */
    async handleYouTubeWebSub(xmlContent, client) {
        if (!xmlContent || typeof xmlContent !== 'string') {
            return { ok: false, error: 'Corps XML vide' };
        }

        const channelMatch = xmlContent.match(/<yt:channelId>([^<]+)<\/yt:channelId>/i);
        const channelId = channelMatch ? channelMatch[1] : null;

        if (!channelId) {
            return { ok: false, error: 'channelId introuvable dans le payload XML.' };
        }

        const allFeeds = await this.repo.listAllActive();
        const matchingFeeds = allFeeds.filter(f => {
            return (f.feedType === 'youtube' || f.feedType === 'youtube_live') && f.feedUrl.includes(channelId);
        });

        for (const feed of matchingFeeds) {
            await this._checkSingleFeed(feed, client || this._client, true);
        }

        return { ok: true, matched: matchingFeeds.length };
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
        }, 60 * 1000); // Scrutation par minute avec contrôle des intervalles individuels
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
