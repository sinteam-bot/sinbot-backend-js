/**
 * src/modules/community_confessions/commands/confess.cmd.js
 *
 * Commandes Slash et interaction buttons pour Confessions Anonymes (Module P1).
 */

const {
    SlashCommandBuilder, PermissionFlagsBits, ChannelType
} = require('discord.js');
const { Command, Button, getConfig } = require('../../../core/index.js');
const { ConfessionsService } = require('../services/confessions.service.js');

class ConfessCommands {
    static inject = [ConfessionsService];

    constructor(service) {
        this.service = service;
    }

    _getConfig() {
        return getConfig().features?.confessions || {};
    }

    async executeConfess(interaction) {
        const content = interaction.options.getString('message');
        const image = interaction.options.getString('image');
        const cfg = this._getConfig();

        const res = await this.service.submitConfession({
            guildId: interaction.guild.id,
            authorId: interaction.user.id,
            content,
            imageUrl: image,
            config: cfg,
            client: interaction.client
        });

        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }

        return interaction.reply({ content: res.message, ephemeral: true });
    }

    async executeReply(interaction) {
        const parentNumber = interaction.options.getInteger('numero');
        const content = interaction.options.getString('message');
        const image = interaction.options.getString('image');
        const cfg = this._getConfig();

        const res = await this.service.submitConfession({
            guildId: interaction.guild.id,
            authorId: interaction.user.id,
            content,
            imageUrl: image,
            parentNumber,
            config: cfg,
            client: interaction.client
        });

        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }

        return interaction.reply({ content: res.message, ephemeral: true });
    }

    async executeConfessBan(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('membre');
        const reason = interaction.options.getString('raison') || 'Abus du système de confessions';

        await this.service.banUser(interaction.guild.id, targetUser.id, reason, interaction.user.id);

        return interaction.reply({
            content: `🚫 <@${targetUser.id}> a été banni de l'envoi de confessions anonymes.`,
            ephemeral: true
        });
    }

    async executeConfessUnban(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('membre');
        await this.service.unbanUser(interaction.guild.id, targetUser.id);

        return interaction.reply({
            content: `✅ <@${targetUser.id}> peut à nouveau poster des confessions anonymes.`,
            ephemeral: true
        });
    }

    async handleApproveButton(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs.', ephemeral: true });
        }

        const id = interaction.customId.replace('confession:approve:', '');
        const cfg = this._getConfig();
        const res = await this.service.approveConfession(id, interaction.user.username, cfg, interaction.client);

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({ content: `✅ Confession #${res.data.number} approuvée et publiée.`, ephemeral: true });
    }

    async handleRejectButton(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs.', ephemeral: true });
        }

        const id = interaction.customId.replace('confession:reject:', '');
        const cfg = this._getConfig();
        const res = await this.service.rejectConfession(id, interaction.user.username, cfg, interaction.client);

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({ content: `❌ Confession rejetée.`, ephemeral: true });
    }
}

const confessBuilder = new SlashCommandBuilder()
    .setName('confess')
    .setDescription('Envoyer une confession 100% anonyme sur le serveur')
    .addStringOption(o => o.setName('message').setDescription('Le texte de ta confession').setRequired(true).setMaxLength(2000))
    .addStringOption(o => o.setName('image').setDescription('URL d’une image d’illustration (optionnel)').setRequired(false));

const replyBuilder = new SlashCommandBuilder()
    .setName('reply')
    .setDescription('Répondre anonymement à une confession')
    .addIntegerOption(o => o.setName('numero').setDescription('Numéro de la confession cible (ex: 42)').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('message').setDescription('Le texte de ta réponse').setRequired(true).setMaxLength(2000))
    .addStringOption(o => o.setName('image').setDescription('URL d’une image (optionnel)').setRequired(false));

const confessBanBuilder = new SlashCommandBuilder()
    .setName('confessban')
    .setDescription('Bannir un membre de l’envoi de confessions (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('membre').setDescription('Le membre à bannir').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison du ban').setRequired(false));

const confessUnbanBuilder = new SlashCommandBuilder()
    .setName('confessunban')
    .setDescription('Débannir un membre des confessions (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('membre').setDescription('Le membre à débannir').setRequired(true));

Command({ name: 'confess', builder: confessBuilder })(ConfessCommands.prototype, 'executeConfess');
Command({ name: 'reply', builder: replyBuilder })(ConfessCommands.prototype, 'executeReply');
Command({ name: 'confessban', builder: confessBanBuilder })(ConfessCommands.prototype, 'executeConfessBan');
Command({ name: 'confessunban', builder: confessUnbanBuilder })(ConfessCommands.prototype, 'executeConfessUnban');

Button('confession:approve')(ConfessCommands.prototype, 'handleApproveButton');
Button('confession:reject')(ConfessCommands.prototype, 'handleRejectButton');

module.exports = { ConfessCommands };
