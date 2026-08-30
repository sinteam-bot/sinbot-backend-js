/**
 * src/modules/util_highlights/commands/highlight.cmd.js
 *
 * Commandes Slash /highlight (Phase 14 G22).
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { HighlightsService } = require('../services/highlights.service.js');

class HighlightCommands {
    static inject = [HighlightsService];

    constructor(service) {
        this.service = service;
    }

    async executeAdd(interaction) {
        const keyword = interaction.options.getString('mot_cle');
        const res = await this.service.addKeyword(interaction.guild.id, interaction.user.id, keyword);

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Mot-clé **"${res.data.keyword}"** ajouté à tes alertes. Tu recevras un DM quand il sera mentionné sur ce serveur.`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const list = await this.service.listKeywords(interaction.guild.id, interaction.user.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Tu n\'as aucun mot-clé surveillé sur ce serveur.', ephemeral: true });
        }

        const lines = list.map(h => `• **${h.keyword}**`);
        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle(`🔔 Tes mots-clés surveillés (${list.length}/15)`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Utilise /highlight remove <mot> pour en supprimer' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeRemove(interaction) {
        const keyword = interaction.options.getString('mot_cle');
        await this.service.removeKeyword(interaction.guild.id, interaction.user.id, keyword);

        return interaction.reply({
            content: `✅ Mot-clé **"${keyword}"** retiré de tes alertes.`,
            ephemeral: true
        });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeAdd(interaction);
            case 'list':   return this.executeList(interaction);
            case 'remove': return this.executeRemove(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const highlightBuilder = new SlashCommandBuilder()
    .setName('highlight')
    .setDescription('Recevoir des alertes DM quand certains mots-clés sont mentionnés sur le serveur')
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter un mot-clé à surveiller')
            .addStringOption(o => o.setName('mot_cle').setDescription('Le mot ou expression à surveiller').setRequired(true).setMaxLength(50))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister tes mots-clés surveillés')
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Supprimer un mot-clé de tes alertes')
            .addStringOption(o => o.setName('mot_cle').setDescription('Le mot-clé à retirer').setRequired(true))
    );

Command({ name: 'highlight', builder: highlightBuilder })(HighlightCommands.prototype, 'executeMain');

module.exports = { HighlightCommands };
