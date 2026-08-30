/**
 * src/modules/util_tags/events/tag-prefix.listener.js
 *
 * Écouteur pour déclencher un tag via le préfixe !tag <nom> ou !t <nom> (Phase 9 G41).
 */

const { OnEvent } = require('../../../core/index.js');
const { TagsService } = require('../services/tags.service.js');
const logger = require('../../../utils/logger.js');

class TagPrefixListener {
    static inject = [TagsService];

    constructor(tagsService) {
        this.tagsService = tagsService;
    }

    async _isEnabled(guildId) {
        const { featureRegistry } = require('../../../core/feature-registry.js');
        const state = await featureRegistry.get(guildId, 'tags');
        return state.enabled;
    }

    async handle(message) {
        if (!message?.guild) return;
        if (message.author?.bot) return;

        const content = (message.content || '').trim();
        let tagName = null;

        if (content.startsWith('!tag ')) {
            tagName = content.slice(5).trim().split(/\s+/)[0];
        } else if (content.startsWith('!t ')) {
            tagName = content.slice(3).trim().split(/\s+/)[0];
        }

        if (!tagName) return;

        const enabled = await this._isEnabled(message.guild.id);
        if (!enabled) return;

        try {
            const tag = await this.tagsService.getTag(message.guild.id, tagName);
            if (tag && tag.content) {
                await message.channel.send(tag.content);
            }
        } catch (err) {
            logger.warn(`Erreur affichage tag ${tagName}: ${err.message}`, 'TAGS');
        }
    }
}

OnEvent('messageCreate', {
    configKey: 'features.tags',
    priority: 37
})(TagPrefixListener.prototype, 'handle');

module.exports = { TagPrefixListener };
