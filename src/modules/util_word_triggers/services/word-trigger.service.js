/**
 * src/modules/util_word_triggers/services/word-trigger.service.js
 *
 * Gestion des triggers de mots et autoresponder (Phase 8 G02 Regex, G30 Conditions positives).
 */

const { Injectable } = require('../../../core/index.js');
const { WordTriggersRepository } = require('./word-triggers.repository.js');

class WordTriggerService {
    static inject = [WordTriggersRepository];

    constructor(repo) {
        this.repo = repo;
        this._cooldowns = new Map(); // key: `g::t`, value: ts
    }

    async create({ guildId, triggerText, matchType, responseText, responseEmbed, excludeChannels, excludeRoles, requiredRoles, cooldown, createdBy }) {
        if (!guildId || !triggerText) {
            return { ok: false, error: 'missing_params' };
        }
        if (!responseText && !responseEmbed) {
            return { ok: false, error: 'response_required' };
        }

        const type = matchType || 'exact';
        if (type === 'regex') {
            try {
                // Valider la syntaxe regex
                new RegExp(triggerText, 'i');
            } catch {
                return { ok: false, error: 'invalid_regex' };
            }
        }

        const created = await this.repo.insertTrigger({
            guildId,
            triggerText: triggerText.slice(0, 100),
            matchType: type,
            responseText: responseText?.slice(0, 500) || null,
            responseEmbedJson: responseEmbed ? JSON.stringify(responseEmbed) : null,
            excludeChannelIdsJson: excludeChannels?.length ? JSON.stringify(excludeChannels) : null,
            excludeRoleIdsJson: excludeRoles?.length ? JSON.stringify(excludeRoles) : null,
            requiredRoleIdsJson: requiredRoles?.length ? JSON.stringify(requiredRoles) : null,
            cooldownSeconds: cooldown ?? 10,
            createdBy
        });

        // Mettre à jour le cache
        await this.loadCache(guildId).catch(() => { });
        return { ok: true, data: created };
    }

    async get(id) {
        return this.repo.getTrigger(id);
    }

    async list(guildId) {
        return this.repo.listTriggers(guildId);
    }

    async delete(id) {
        const trigger = await this.repo.getTrigger(id);
        await this.repo.deleteTrigger(id);
        if (trigger?.guildId) {
            await this.loadCache(trigger.guildId).catch(() => { });
        }
        return { ok: true };
    }

    async findMatching(guildId, content) {
        if (!this._cache?.has(guildId)) {
            await this.loadCache(guildId);
        }
        return this._match(guildId, content);
    }

    findMatchingSync(guildId, content) {
        return this._match(guildId, content);
    }

    _match(guildId, content) {
        const list = this._cache?.get(guildId) || [];
        const lc = (content || '').toLowerCase();
        for (const t of list) {
            const trigger = (t.triggerText || '').toLowerCase();
            if (t.matchType === 'exact' && lc === trigger) return t;
            if (t.matchType === 'contains' && lc.includes(trigger)) return t;
            if (t.matchType === 'regex') {
                try {
                    const re = new RegExp(t.triggerText, 'i');
                    if (re.test(content)) return t;
                } catch { }
            }
        }
        return null;
    }

    shouldFire(trigger, message, member) {
        if (!trigger || !message) return { ok: false, reason: 'invalid' };

        // 1. Cooldown
        const key = `${trigger.guildId}::${trigger.id}`;
        const last = this._cooldowns.get(key) || 0;
        if (Date.now() - last < (trigger.cooldownSeconds || 0) * 1000) {
            return { ok: false, reason: 'cooldown' };
        }

        // 2. Channel excludes
        if (trigger.excludeChannelIds?.length && trigger.excludeChannelIds.includes(message.channelId)) {
            return { ok: false, reason: 'channel_excluded' };
        }

        // 3. Role excludes
        if (trigger.excludeRoleIds?.length && member) {
            const memberRoleIds = Array.from(member.roles?.cache?.keys() || []);
            if (trigger.excludeRoleIds.some(rid => memberRoleIds.includes(rid))) {
                return { ok: false, reason: 'role_excluded' };
            }
        }

        // 4. Positive condition: Required roles (G30)
        if (trigger.requiredRoleIds?.length && member) {
            const memberRoleIds = Array.from(member.roles?.cache?.keys() || []);
            const hasRequired = trigger.requiredRoleIds.some(rid => memberRoleIds.includes(rid));
            if (!hasRequired) {
                return { ok: false, reason: 'role_required' };
            }
        }

        return { ok: true };
    }

    incrementCooldown(trigger) {
        const key = `${trigger.guildId}::${trigger.id}`;
        this._cooldowns.set(key, Date.now());
    }

    async loadCache(guildId) {
        const list = await this.repo.listTriggers(guildId);
        this._cache = this._cache || new Map();
        this._cache.set(guildId, list);
        return list;
    }
}

Injectable()(WordTriggerService);

module.exports = { WordTriggerService };
