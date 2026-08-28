/**
 * word-trigger.service.js — gestion des triggers de mots
 *
 *   - create({ guildId, triggerText, matchType, responseText, responseEmbed, excludeChannels, excludeRoles, cooldown, createdBy })
 *   - list(guildId)
 *   - delete(id)
 *   - findMatching(guildId, content) : retourne le premier trigger qui match
 *   - shouldFire(trigger, message, member) : check cooldown, excludes
 *   - incrementCooldown(triggerId)
 *
 * Cooldowns : Map en mémoire (par guildId+triggerId).
 * Regex match type : à venir en V2 (sécurité : éviter les ReDoS).
 */

const { Injectable } = require('../../../core/index.js');
const { EngagementRepository } = require('./engagement.repository.js');

class WordTriggerService {
    static inject = [EngagementRepository];

    constructor(repo) {
        this.repo = repo;
        this._cooldowns = new Map(); // key: `g::t`, value: ts
    }

    async create({ guildId, triggerText, matchType, responseText, responseEmbed, excludeChannels, excludeRoles, cooldown, createdBy }) {
        if (!guildId || !triggerText) {
            return { ok: false, error: 'missing_params' };
        }
        if (matchType === 'regex') {
            return { ok: false, error: 'regex_not_supported_yet' };
        }
        if (!responseText && !responseEmbed) {
            return { ok: false, error: 'response_required' };
        }
        const created = await this.repo.insertTrigger({
            guildId,
            triggerText: triggerText.slice(0, 100),
            matchType: matchType || 'exact',
            responseText: responseText?.slice(0, 500) || null,
            responseEmbedJson: responseEmbed ? JSON.stringify(responseEmbed) : null,
            excludeChannelIdsJson: excludeChannels?.length ? JSON.stringify(excludeChannels) : null,
            excludeRoleIdsJson: excludeRoles?.length ? JSON.stringify(excludeRoles) : null,
            cooldownSeconds: cooldown ?? 10,
            createdBy
        });
        return { ok: true, data: created };
    }

    async get(id) {
        return this.repo.getTrigger(id);
    }

    async list(guildId) {
        return this.repo.listTriggers(guildId);
    }

    async delete(id) {
        await this.repo.deleteTrigger(id);
        return { ok: true };
    }

    /**
     * Trouve le premier trigger qui matche le contenu d'un message
     * dans un guild. Le matching est 'exact' ou 'contains'.
     *
     * Utilise la cache en mémoire si disponible (loadCache),
     * sinon fait un lookup direct en BDD.
     */
    async findMatching(guildId, content) {
        return this._match(guildId, content);
    }

    /**
     * Sync version of findMatching (assumes cache is already loaded)
     */
    findMatchingSync(guildId, content) {
        return this._match(guildId, content);
    }

    _match(guildId, content) {
        const list = this._cache?.get(guildId) || [];
        const lc = content.toLowerCase();
        for (const t of list) {
            const trigger = t.triggerText.toLowerCase();
            if (t.matchType === 'exact' && lc === trigger) return t;
            if (t.matchType === 'contains' && lc.includes(trigger)) return t;
            if (t.matchType === 'regex') {
                try {
                    const re = new RegExp(t.triggerText, 'i');
                    if (re.test(content)) return t;
                } catch {}
            }
        }
        return null;
    }

    /**
     * Vérifie si le trigger peut être déclenché maintenant
     * (cooldown + channel exclude + role exclude)
     */
    shouldFire(trigger, message, member) {
        if (!trigger || !message) return { ok: false, reason: 'invalid' };

        // Cooldown
        const key = `${trigger.guildId}::${trigger.id}`;
        const last = this._cooldowns.get(key) || 0;
        if (Date.now() - last < (trigger.cooldownSeconds || 0) * 1000) {
            return { ok: false, reason: 'cooldown' };
        }

        // Channel excludes
        if (trigger.excludeChannelIds?.length && trigger.excludeChannelIds.includes(message.channelId)) {
            return { ok: false, reason: 'channel_excluded' };
        }

        // Role excludes
        if (trigger.excludeRoleIds?.length && member) {
            const memberRoleIds = Array.from(member.roles?.cache?.keys() || []);
            if (trigger.excludeRoleIds.some(rid => memberRoleIds.includes(rid))) {
                return { ok: false, reason: 'role_excluded' };
            }
        }

        return { ok: true };
    }

    incrementCooldown(trigger) {
        const key = `${trigger.guildId}::${trigger.id}`;
        this._cooldowns.set(key, Date.now());
    }

    /**
     * Recharge la cache en mémoire (appelée par le module init).
     * On garde une copie pour eviter les requetes BDD a chaque message.
     */
    async loadCache(guildId) {
        const list = await this.repo.listTriggers(guildId);
        this._cache = this._cache || new Map();
        this._cache.set(guildId, list);
        return list;
    }
}

Injectable()(WordTriggerService);

module.exports = { WordTriggerService };
