/**
 * src/modules/util_tags/commands/tags.cmd.js
 *
 * Commandes Slash pour la gestion des tags (Phase 9 G41).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { TagsService } = require('../services/tags.service.js');

class TagsCommands {
    static inject = [TagsService];

    constructor(tagsService) {
        this.tagsService = tagsService;
    }

    async executeGet(interaction) {
        const name = interaction.options.getString('nom');
        const tag = await this.tagsService.getTag(interaction.guild.id, name);

        if (!tag) {
            return interaction.reply({ content: `❌ Tag "${name}" introuvable.`, ephemeral: true });
        }

        return interaction.reply({ content: tag.content });
    }

    async executeCreate(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs / administrateurs (ManageMessages).', ephemeral: true });
        }

        const name = interaction.options.getString('nom');
        const content = interaction.options.getString('contenu');

        const res = await this.tagsService.createTag({
            guildId: interaction.guild.id,
            name,
            content,
            createdBy: interaction.user.id
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Tag **${name}** créé avec succès ! Tu peux l'utiliser avec \`/tag get ${name}\` ou \`!tag ${name}\`.`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const tags = await this.tagsService.listTags(interaction.guild.id);
        if (tags.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun tag configuré sur ce serveur.', ephemeral: true });
        }

        const lines = tags.map(t => `• **${t.name}** (${t.uses} utilisations)`);

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🏷️ Tags du serveur (${tags.length})`)
            .setDescription(lines.slice(0, 50).join('\n'))
            .setFooter({ text: 'Utilisation : /tag get <nom> ou !tag <nom>' });

        return interaction.reply({ embeds: [embed] });
    }

    async executeDelete(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs / administrateurs (ManageMessages).', ephemeral: true });
        }

        const name = interaction.options.getString('nom');
        const res = await this.tagsService.deleteTag(interaction.guild.id, name);

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({ content: `✅ Tag **${name}** supprimé.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'get':    return this.executeGet(interaction);
            case 'create': return this.executeCreate(interaction);
            case 'list':   return this.executeList(interaction);
            case 'delete': return this.executeDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const tagsBuilder = new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Afficher ou gérer les tags et raccourcis de réponses')
    .addSubcommand(sub =>
        sub.setName('get')
            .setDescription('Afficher le contenu d’un tag')
            .addStringOption(o => o.setName('nom').setDescription('Nom du tag').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('create')
            .setDescription('Créer un nouveau tag (modérateur)')
            .addStringOption(o => o.setName('nom').setDescription('Nom du tag').setRequired(true).setMaxLength(32))
            .addStringOption(o => o.setName('contenu').setDescription('Contenu du tag').setRequired(true).setMaxLength(1500))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister tous les tags disponibles')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un tag (modérateur)')
            .addStringOption(o => o.setName('nom').setDescription('Nom du tag').setRequired(true))
    );

Command({ name: 'tag', builder: tagsBuilder })(TagsCommands.prototype, 'executeMain');

module.exports = { TagsCommands };
