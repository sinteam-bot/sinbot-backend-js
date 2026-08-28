/**
 * DropReactionListener — claim automatique via 🎉 reaction
 *
 * Quand un user ajoute la réaction 🎉 sur le message d'un drop actif,
 * on tente de claim le drop. Si déjà claim → silent fail.
 * Si expired → silent fail (le cron expireDueDrops fera le ménage).
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { InventoryService } = require('../services/inventory.service.js');

class DropReactionListener {
    static inject = [InventoryService];

    constructor(inventory) {
        this.inventory = inventory;
    }

    async _enabled(guildId) {
        const state = await featureRegistry.get(guildId, 'economy');
        if (!state.enabled) return false;
        return state.config?.drops?.require_button === false; // claim only via reaction if not require_button
    }

    async handle(reaction, user) {
        if (!reaction?.message?.guild) return;
        if (user?.bot) return;
        const cfg = await featureRegistry.get(reaction.message.guild.id, 'economy');
        if (!cfg.enabled) return;
        if (cfg.config?.drops?.require_button !== false) return; // only active if require_button=false

        // Normalise l'emoji en string
        const emojiKey = reaction.emoji?.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji?.name;
        if (emojiKey !== '🎉') return;

        const drop = await this.inventory.getDropByMessage(reaction.message.id);
        if (!drop) return;
        const r = await this.inventory.claimDrop(drop.id, user.id);
        if (r.ok) {
            try {
                await reaction.message.channel.send({ content: `🎉 <@${user.id}> a récupéré **${r.data.quantity}x** <:${reaction.emoji.name}:${reaction.emoji.id || ''}> !` }).catch(() => {});
            } catch {}
        }
    }
}

OnEvent('messageReactionAdd', { configKey: 'features.economy', priority: 20 })(DropReactionListener.prototype, 'handle');

module.exports = { DropReactionListener };
