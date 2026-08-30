/**
 * src/modules/util_tags/services/tags.service.js
 *
 * Service métier pour les tags et réponses courtes (Phase 9 G41).
 */

const { Injectable } = require('../../../core/index.js');
const { TagsRepository } = require('./tags.repository.js');

class TagsService {
    static inject = [TagsRepository];

    constructor(repo) {
        this.repo = repo;
    }

    async createTag({ guildId, name, content, createdBy }) {
        if (!guildId || !name || !content) {
            return { ok: false, error: 'Paramètres manquants (guildId, name, content)' };
        }

        const cleanName = name.trim().toLowerCase();
        if (cleanName.length > 32) {
            return { ok: false, error: 'Le nom du tag ne doit pas dépasser 32 caractères' };
        }

        const existing = await this.repo.getTag(guildId, cleanName);
        if (existing) {
            return { ok: false, error: `Un tag nommé "${cleanName}" existe déjà.` };
        }

        const created = await this.repo.createTag({
            guildId,
            name: cleanName,
            content: content.slice(0, 1500),
            createdBy
        });

        return { ok: true, data: created };
    }

    async getTag(guildId, name, increment = true) {
        const cleanName = (name || '').trim().toLowerCase();
        const tag = await this.repo.getTag(guildId, cleanName);
        if (tag && increment) {
            await this.repo.incrementUses(guildId, cleanName).catch(() => { });
            tag.uses += 1;
        }
        return tag;
    }

    async listTags(guildId) {
        return this.repo.listTags(guildId);
    }

    async deleteTag(guildId, name) {
        const cleanName = (name || '').trim().toLowerCase();
        const existing = await this.repo.getTag(guildId, cleanName);
        if (!existing) {
            return { ok: false, error: `Tag "${cleanName}" introuvable.` };
        }
        await this.repo.deleteTag(guildId, cleanName);
        return { ok: true };
    }
}

Injectable()(TagsService);

module.exports = { TagsService };
