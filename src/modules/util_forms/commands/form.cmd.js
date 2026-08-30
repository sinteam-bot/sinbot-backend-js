/**
 * src/modules/util_forms/commands/form.cmd.js
 *
 * Commandes Slash /form (Phase 14 G21).
 */

const {
    SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
    PermissionFlagsBits, ChannelType, EmbedBuilder
} = require('discord.js');
const { Command } = require('../../../core/index.js');
const { FormsService } = require('../services/forms.service.js');

class FormCommands {
    static inject = [FormsService];

    constructor(service) {
        this.service = service;
    }

    async executeCreate(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const name = interaction.options.getString('nom');
        const title = interaction.options.getString('titre');
        const channel = interaction.options.getChannel('salon_resultats');
        const description = interaction.options.getString('description');

        const questions = [
            { id: 'q1', label: 'Votre message ou motivation', required: true, style: 'paragraph' }
        ];

        const res = await this.service.createForm({
            guildId: interaction.guild.id,
            name,
            title,
            description,
            channelId: channel.id,
            questions
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Formulaire **${title}** (\`${name}\`) créé. Les réponses seront envoyées dans <#${channel.id}>. Utilisez \`/form open ${name}\` pour l'ouvrir.`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const list = await this.service.listForms(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun formulaire configuré sur ce serveur.', ephemeral: true });
        }

        const lines = list.map(f => `• **${f.title}** (\`${f.name}\`) — Réponses dans <#${f.channelId}> (ID: \`${f.id}\`)`);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📋 Formulaires du serveur (${list.length})`)
            .setDescription(lines.join('\n'));

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeOpen(interaction) {
        const name = interaction.options.getString('nom');
        const form = await this.service.getForm(name, interaction.guild.id);

        if (!form) {
            return interaction.reply({ content: `❌ Formulaire "${name}" introuvable.`, ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`form_submit:${form.id}`)
            .setTitle(form.title.slice(0, 45));

        const questions = form.questions?.length ? form.questions : [{ id: 'q1', label: 'Réponse', required: true, style: 'paragraph' }];

        for (const q of questions.slice(0, 5)) {
            const input = new TextInputBuilder()
                .setCustomId(q.id || 'q')
                .setLabel(q.label.slice(0, 45))
                .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                .setRequired(Boolean(q.required));

            modal.addComponents(new ActionRowBuilder().addComponents(input));
        }

        await interaction.showModal(modal);
    }

    async executeDelete(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const id = interaction.options.getString('id');
        await this.service.deleteForm(id);

        return interaction.reply({ content: `✅ Formulaire \`${id}\` supprimé.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'create': return this.executeCreate(interaction);
            case 'list':   return this.executeList(interaction);
            case 'open':   return this.executeOpen(interaction);
            case 'delete': return this.executeDelete(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const formBuilder = new SlashCommandBuilder()
    .setName('form')
    .setDescription('Gestion et soumission de formulaires personnalisés')
    .addSubcommand(sub =>
        sub.setName('open')
            .setDescription('Ouvrir et remplir un formulaire')
            .addStringOption(o => o.setName('nom').setDescription('Nom court du formulaire').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les formulaires disponibles')
    )
    .addSubcommand(sub =>
        sub.setName('create')
            .setDescription('Créer un nouveau formulaire (admin)')
            .addStringOption(o => o.setName('nom').setDescription('Nom court identifiant (ex: recrutement)').setRequired(true))
            .addStringOption(o => o.setName('titre').setDescription('Titre affiché').setRequired(true))
            .addChannelOption(o => o.setName('salon_resultats').setDescription('Salon de réception des réponses').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName('description').setDescription('Description du formulaire').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un formulaire (admin)')
            .addStringOption(o => o.setName('id').setDescription('ID du formulaire').setRequired(true))
    );

Command({ name: 'form', builder: formBuilder })(FormCommands.prototype, 'executeMain');

module.exports = { FormCommands };
