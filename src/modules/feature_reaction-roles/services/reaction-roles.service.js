/**
 * reaction-roles.service.js — logique métier des rôles à réaction
 *
 * Phase 10 v1 : reactions emoji → role
 * Phase 10 v2 : buttons (toggle_role/give_role/take_role/open_url) + select menus
 *
 * Utilise le composant partagé InteractiveMessageBuilder
 * (src/services/interactive-message-builder.js) pour valider
 * et exécuter les actions.
 */

const crypto = require('crypto');
const { Injectable } = require('../../../core/index.js');
const { ReactionRolesRepository } = require('./reaction-roles.repository.js');
const { InteractiveMessageBuilder } = require('../../../services/interactive-message-builder.js');

class ReactionRolesService {
    static inject = [ReactionRolesRepository];

    constructor(repo) {
        this.repo = repo;
        this.builder = new InteractiveMessageBuilder();
    }

    /**
     * Crée un reaction-role (kind=reaction par défaut).
     * Si kind=button|select, metadata est validé via InteractiveMessageBuilder.
     * @returns {Promise<{ok: boolean, error?: string, data?: any}>}
     */
    async create({ guildId, channelId, messageId, emoji, roleId, description, mode, kind, metadata }) {
        const k = kind || 'reaction';

        if (!guildId || !channelId || !messageId) {
            return { ok: false, error: 'missing_params' };
        }
        if (roleId === guildId) {
            return { ok: false, error: 'cannot_use_everyone' };
        }

        let comp;
        if (k === 'reaction') {
            const emojiKey = this.normalizeEmoji(emoji);
            if (!emojiKey) return { ok: false, error: 'invalid_emoji' };

            const existing = await this.repo.findByMessageEmoji(messageId, emojiKey);
            if (existing) {
                return { ok: false, error: 'already_exists', data: existing };
            }
            comp = { id: crypto.randomUUID(), emoji: emojiKey, roleId, description, mode: mode || 'toggle' };
        } else {
            // Build a temporary component object for validation
            comp = { kind: k, ...metadata, roleId, customIdSuffix: metadata?.customIdSuffix };
            try {
                this.builder.validateComponent(comp);
            } catch (err) {
                return { ok: false, error: `invalid_metadata: ${err.message}` };
            }
            // For button, we need a stable id (used in custom_id)
            comp.id = comp.id || crypto.randomUUID();
        }

        const id = comp.id;
        const created = await this.repo.insert({
            id,
            guildId,
            channelId,
            messageId,
            emoji: comp.emoji || '',
            roleId: comp.roleId || '',
            description: comp.description || null,
            mode: k === 'reaction' ? (mode || 'toggle') : null,
            kind: k,
            metadata: k === 'reaction' ? null : (metadata || null)
        });
        return { ok: true, data: created };
    }

    async list(guildId, limit, offset) {
        return this.repo.listByGuild({ guildId, limit, offset });
    }

    async listByMessage(guildId, messageId) {
        return this.repo.listByMessage(guildId, messageId);
    }

    async get(id) {
        return this.repo.findById(id);
    }

    async update(id, fields) {
        await this.repo.update(id, { ...fields, updated_at: Date.now() });
        return this.repo.findById(id);
    }

    async delete(id) {
        return this.repo.delete(id);
    }

    async deleteByMessage(guildId, messageId) {
        return this.repo.deleteByMessage(guildId, messageId);
    }

    /**
     * Normalise un emoji en string clé pour la BDD.
     */
    normalizeEmoji(emoji) {
        if (!emoji) return null;
        if (typeof emoji === 'string') return emoji;
        if (typeof emoji === 'object') {
            if (emoji.id) return `${emoji.name}:${emoji.id}`;
            if (emoji.name) return emoji.name;
        }
        return null;
    }

    /**
     * Récupère un reaction-role par message+emoji (Phase 10 v1).
     */
    async findForReaction(messageId, emoji) {
        const key = this.normalizeEmoji(emoji);
        if (!key) return null;
        return this.repo.findByMessageEmoji(messageId, key);
    }

    /**
     * Récupère un component par custom_id (Phase 10 v2).
     * Le custom_id est de la forme `ir:<componentId>` ou `ir:<componentId>:<suffix>`.
     */
    async findForCustomId(messageId, customId) {
        const parsed = this.builder.parseCustomId(customId);
        if (!parsed) return null;
        const list = await this.repo.listByMessage('', messageId);
        // Filter by kind != reaction and matching id
        return list.find(c =>
            (c.kind === 'button' || c.kind === 'select') && c.id === parsed.id
        ) || null;
    }
}

Injectable()(ReactionRolesService);

module.exports = { ReactionRolesService };
