/**
 * src/modules/util_autofeeds/services/autofeeds-subscription.service.js
 *
 * Service de gestion et de ciblage des souscriptions utilisateurs aux flux, tags et catégories.
 */

const { Injectable } = require('../../../core/index.js');
const { AutofeedsRepository } = require('./autofeeds.repository.js');

class AutofeedsSubscriptionService {
    static inject = [AutofeedsRepository];

    constructor(repo) {
        this.repo = repo;
    }

    /**
     * Ajoute ou met à jour une souscription utilisateur.
     */
    async subscribe({ guildId, userId, targetType, targetValue, notifyMode = 'mention', filters = {} }) {
        if (!guildId || !userId || !targetType || !targetValue) {
            return { ok: false, error: 'Paramètres manquants pour la souscription.' };
        }

        const validTypes = ['tag', 'category', 'feed', 'keyword', 'account', 'author'];
        if (!validTypes.includes(targetType)) {
            return { ok: false, error: `Type de souscription invalide (${validTypes.join(', ')} attendus).` };
        }

        const validModes = ['mention', 'dm', 'both', 'role'];
        if (!validModes.includes(notifyMode)) {
            notifyMode = 'mention';
        }

        const sub = await this.repo.addSubscription({
            guildId,
            userId,
            targetType,
            targetValue,
            notifyMode,
            filters: filters || {}
        });

        return { ok: true, data: sub };
    }

    /**
     * Supprime une souscription utilisateur.
     */
    async unsubscribe({ guildId, userId, targetType, targetValue }) {
        const res = await this.repo.removeSubscription({ guildId, userId, targetType, targetValue });
        return { ok: true, deleted: res.deleted };
    }

    /**
     * Supprime une souscription par son ID unique.
     */
    async unsubscribeById(id) {
        const res = await this.repo.removeSubscriptionById(id);
        return { ok: true, deleted: res.deleted };
    }

    /**
     * Liste les souscriptions d'un utilisateur donné sur un serveur.
     */
    async listUserSubscriptions(guildId, userId) {
        return this.repo.listUserSubscriptions(guildId, userId);
    }

    /**
     * Liste toutes les souscriptions d'un serveur.
     */
    async listGuildSubscriptions(guildId) {
        return this.repo.listGuildSubscriptions(guildId);
    }

    /**
     * Détermine les utilisateurs qui doivent être notifiés pour un article donné.
     * Compare les tags, la catégorie, le créateur/auteur, l'ID du flux et les mots-clés du texte.
     * @param {string} guildId
     * @param {Object} feed
     * @param {Object} item
     * @returns {Promise<{ mentionUserIds: Array<string>, dmUserIds: Array<string>, matchedTags: Array<string> }>}
     */
    async findMatchingSubscribers(guildId, feed, item) {
        const guildSubs = await this.repo.listGuildSubscriptions(guildId);
        if (guildSubs.length === 0) {
            return { mentionUserIds: [], dmUserIds: [], matchedTags: [] };
        }

        // 1. Collecter tous les tags associés à l'article
        const feedTags = Array.isArray(feed.tags) ? feed.tags.map(t => t.toLowerCase()) : [];
        const itemTags = Array.isArray(item.tags) ? item.tags.map(t => t.toLowerCase()) : [];
        const allTags = new Set([...feedTags, ...itemTags]);

        const category = (feed.category || 'general').toLowerCase();
        const feedId = (feed.id || '').toLowerCase();
        const fullText = `${item.title || ''} ${item.content || ''}`.toLowerCase();
        const authorLower = (item.author || '').toLowerCase().replace('@', '').trim();

        const mentionUsers = new Set();
        const dmUsers = new Set();
        const matchedTags = new Set();

        for (const sub of guildSubs) {
            let matched = false;
            const targetVal = (sub.targetValue || '').toLowerCase().trim();

            switch (sub.targetType) {
                case 'tag':
                    if (allTags.has(targetVal)) {
                        matched = true;
                        matchedTags.add(sub.targetValue);
                    }
                    break;

                case 'category':
                    if (category === targetVal) {
                        matched = true;
                    }
                    break;

                case 'account':
                case 'author':
                    const targetAuthor = targetVal.replace('@', '');
                    if (authorLower && (authorLower === targetAuthor || authorLower.includes(targetAuthor))) {
                        matched = true;
                    }
                    break;

                case 'feed':
                    if (feedId === targetVal) {
                        matched = true;
                    }
                    break;

                case 'keyword':
                    if (fullText.includes(targetVal)) {
                        matched = true;
                    }
                    break;
            }

            // Vérifier les filtres personnels de l'abonné (include/exclude/regex)
            if (matched && sub.filters && typeof sub.filters === 'object') {
                const inc = sub.filters.includeKeywords || sub.filters.filterKeywords;
                if (Array.isArray(inc) && inc.length > 0) {
                    const hasInclude = inc.some(kw => {
                        const k = (kw || '').trim().toLowerCase();
                        return k && fullText.includes(k);
                    });
                    if (!hasInclude) matched = false;
                }

                const exc = sub.filters.excludeKeywords;
                if (matched && Array.isArray(exc) && exc.length > 0) {
                    const hasExclude = exc.some(kw => {
                        const k = (kw || '').trim().toLowerCase();
                        return k && fullText.includes(k);
                    });
                    if (hasExclude) matched = false;
                }

                const reg = sub.filters.regexFilter || sub.filters.regex;
                if (matched && reg && typeof reg === 'string' && reg.trim()) {
                    try {
                        const re = new RegExp(reg.trim(), 'i');
                        if (!re.test(fullText)) matched = false;
                    } catch {}
                }
            }

            if (matched) {
                if (sub.notifyMode === 'dm') {
                    dmUsers.add(sub.userId);
                } else if (sub.notifyMode === 'both') {
                    dmUsers.add(sub.userId);
                    mentionUsers.add(sub.userId);
                } else {
                    mentionUsers.add(sub.userId);
                }
            }
        }

        return {
            mentionUserIds: Array.from(mentionUsers),
            dmUserIds: Array.from(dmUsers),
            matchedTags: Array.from(matchedTags)
        };
    }
}

Injectable()(AutofeedsSubscriptionService);

module.exports = { AutofeedsSubscriptionService };
