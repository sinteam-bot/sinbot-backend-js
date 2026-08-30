/**
 * src/modules/community_tickets/commands/ticket-tag.cmd.js
 *
 * Commandes Slash /ticket-tag pour les réponses prédéfinies (Module P4).
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { TicketService } = require('../services/ticket.service.js');

class TicketTagCommands {
    static inject = [TicketService];

    constructor(service) {
        this.service = service;
    }

    // =================== TAGS ===================

    async executeAdd(interaction) {
        const name = interaction.options.getString('nom');
        const content = interaction.options.getString('contenu');

        const tag = await this.service.setTag({
            guildId: interaction.guild.id,
            name,
            content,
            createdBy: interaction.user.id
        });

        return interaction.reply({ content: `✅ Réponse rapide \`${tag.name}\` enregistrée.`, ephemeral: true });
    }

    async executeUse(interaction) {
        const name = interaction.options.getString('nom');
        const tag = await this.service.getTag(interaction.guild.id, name);

        if (!tag) {
            return interaction.reply({ content: `❌ Aucun tag nommé "${name}".`, ephemeral: true });
        }

        return interaction.reply({ content: tag.content });
    }

    async executeList(interaction) {
        const list = await this.service.listTags(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun tag enregistré pour les tickets.', ephemeral: true });
        }

        const lines = list.map(t => `• \`${t.name}\` : ${t.content.slice(0, 60)}...`);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🏷️ Réponses rapides de tickets (${list.length})`)
            .setDescription(lines.join('\n'));

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeDelete(interaction) {
        const name = interaction.options.getString('nom');
        await this.service.deleteTag(interaction.guild.id, name);
        return interaction.reply({ content: `✅ Tag \`${name}\` supprimé.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeAdd(interaction);
            case 'use':    return this.executeUse(interaction);
            case 'list':   return this.executeList(interaction);
            case 'delete': return this.executeDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const tagBuilder = new SlashCommandBuilder()
    .setName('ticket-tag')
    .setDescription('Gestion des réponses rapides / canned responses pour les tickets')
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter une réponse rapide')
            .addStringOption(o => o.setName('nom').setDescription('Nom court du tag').setRequired(true))
            .addStringOption(o => o.setName('contenu').setDescription('Contenu de la réponse').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('use')
            .setDescription('Envoyer une réponse rapide dans le salon')
            .addStringOption(o => o.setName('nom').setDescription('Nom du tag').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les réponses rapides disponibles')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer une réponse rapide')
            .addStringOption(o => o.setName('nom').setDescription('Nom du tag à supprimer').setRequired(true))
    );

Command({ name: 'ticket-tag', builder: tagBuilder })(TicketTagCommands.prototype, 'executeMain');

module.exports = { TicketTagCommands };
