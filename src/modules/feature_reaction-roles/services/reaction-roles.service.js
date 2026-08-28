/**
 * reaction-roles.service.js — logique métier des rôles à réaction
 *
 *   - create({ guildId, channelId, messageId, emoji, roleId, description })
 *   - list / get / update / delete / deleteByMessage
 *   - applyToMember(member, emoji, op)   : add/remove role suite à une reaction
 *   - getEmojiKey(reaction)               : normalise emoji en string clé
 *
 * Toutes les operations discord.js (channel.send, member.roles.add/remove)
 * sont déléguées au listener events/reaction-listener.js.
 */

const { Injectable } = require('../../../core/index.js');
const { ReactionRolesRepository } = require('./reaction-roles.repository.js');

class ReactionRolesService {
    static inject = [ReactionRolesRepository];

    constructor(repo) {
        this.repo = repo;
    }

    /**
     * Crée un reaction-role.
     * @returns {Promise<{ok: boolean, error?: string, data?: any}>}
     */
    async create({ guildId, channelId, messageId, emoji, roleId, description, mode }) {
        if (!guildId || !channelId || !messageId || !emoji || !roleId) {
            return { ok: false, error: 'missing_params' };
        }
        if (roleId === guildId) {
            return { ok: false, error: 'cannot_use_everyone' };
        }
        const emojiKey = this.normalizeEmoji(emoji);
        if (!emojiKey) return { ok: false, error: 'invalid_emoji' };

        const existing = await this.repo.findByMessageEmoji(messageId, emojiKey);
        if (existing) {
            return { ok: false, error: 'already_exists', data: existing };
        }
        const id = crypto.randomUUID();
        const created = await this.repo.insert({
            id,
            guildId,
            channelId,
            messageId,
            emoji: emojiKey,
            roleId,
            description: description || null,
            mode: mode || 'toggle'
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
     * Accepte :
     *   - une string brute (unicode ou nom custom)  -> inchangé
     *   - un objet discord.js ReactionEmoji          -> name:id si custom, name sinon
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
     * Récupère la config d'un reaction-role par message+emoji.
     */
    async findForReaction(messageId, emoji) {
        const key = this.normalizeEmoji(emoji);
        if (!key) return null;
        return this.repo.findByMessageEmoji(messageId, key);
    }
}

const crypto = require('crypto');
Injectable()(ReactionRolesService);

module.exports = { ReactionRolesService };
