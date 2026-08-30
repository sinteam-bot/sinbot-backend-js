/**
 * src/modules/util_afk/commands/afk.cmd.js
 *
 * Commande Slash pour déclarer un statut AFK (Phase 9 G06).
 */

const { SlashCommandBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { AfkService } = require('../services/afk.service.js');

class AfkCommands {
    static inject = [AfkService];

    constructor(afkService) {
        this.afkService = afkService;
    }

    async executeAfk(interaction) {
        const reason = interaction.options.getString('raison');
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        await this.afkService.setAfk(guildId, userId, reason);

        const reasonStr = reason ? ` : *${reason}*` : '';
        return interaction.reply({
            content: `💤 Tu es maintenant marqué(e) comme AFK${reasonStr}. J'avertirai ceux qui te mentionnent et retirerai ton statut dès ton prochain message.`
        });
    }
}

const afkBuilder = new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Définir ton statut d’absence (AFK)')
    .addStringOption(o => o.setName('raison').setDescription('Raison de ton absence').setRequired(false).setMaxLength(250));

Command({ name: 'afk', builder: afkBuilder })(AfkCommands.prototype, 'executeAfk');

module.exports = { AfkCommands };
