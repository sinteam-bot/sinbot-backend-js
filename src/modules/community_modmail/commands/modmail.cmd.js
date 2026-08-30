/**
 * src/modules/community_modmail/commands/modmail.cmd.js
 *
 * Commandes Slash pour ModMail (Module P3).
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { ModMailService } = require('../services/modmail.service.js');

class ModMailCommands {
    static inject = [ModMailService];

    constructor(service) {
        this.service = service;
    }

    _getConfig() {
        return getConfig().features?.modmail || {};
    }

    async executeReply(interaction, isAnonymous = false) {
        const content = interaction.options.getString('message');
        const image = interaction.options.getString('image');
        const cfg = this._getConfig();

        const res = await this.service.replyToUser({
            channelId: interaction.channel.id,
            staffUser: interaction.member || interaction.user,
            content,
            imageUrl: image,
            isAnonymous,
            client: interaction.client,
            config: cfg
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({ content: `✅ Réponse envoyée au membre (${isAnonymous ? 'Anonyme' : 'Public'}).`, ephemeral: true });
    }

    async executeClose(interaction) {
        const reason = interaction.options.getString('raison') || 'Problème résolu';
        const cfg = this._getConfig();

        const res = await this.service.closeThread({
            channelId: interaction.channel.id,
            closedBy: interaction.user,
            reason,
            client: interaction.client,
            config: cfg
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }
    }

    async executeBan(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const user = interaction.options.getUser('membre');
        const reason = interaction.options.getString('raison') || 'Spam ou comportement abusif';

        await this.service.banUser(interaction.guild.id, user.id, reason, interaction.user.id);
        return interaction.reply({ content: `🚫 <@${user.id}> a été banni de l'assistance ModMail.`, ephemeral: true });
    }

    async executeUnban(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const user = interaction.options.getUser('membre');
        await this.service.unbanUser(interaction.guild.id, user.id);
        return interaction.reply({ content: `✅ <@${user.id}> peut à nouveau contacter le ModMail.`, ephemeral: true });
    }

    async executeSnippetMain(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'add') {
            const name = interaction.options.getString('nom');
            const content = interaction.options.getString('contenu');
            const snip = await this.service.setSnippet({ guildId, name, content, createdBy: interaction.user.id });
            return interaction.reply({ content: `✅ Snippet \`${snip.name}\` enregistré.`, ephemeral: true });
        }

        if (sub === 'use') {
            const name = interaction.options.getString('nom');
            const snip = await this.service.getSnippet(guildId, name);
            if (!snip) {
                return interaction.reply({ content: `❌ Aucun snippet nommé "${name}".`, ephemeral: true });
            }

            // Envoi de la réponse au membre dans le fil actuel
            const cfg = this._getConfig();
            const res = await this.service.replyToUser({
                channelId: interaction.channel.id,
                staffUser: interaction.member || interaction.user,
                content: snip.content,
                isAnonymous: false,
                client: interaction.client,
                config: cfg
            });

            if (!res.ok) {
                return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
            }
            return interaction.reply({ content: `✅ Snippet \`${name}\` envoyé au membre.`, ephemeral: true });
        }

        if (sub === 'list') {
            const list = await this.service.listSnippets(guildId);
            if (list.length === 0) {
                return interaction.reply({ content: 'ℹ️ Aucun snippet enregistré sur ce serveur.', ephemeral: true });
            }
            const lines = list.map(s => `• \`${s.name}\` : ${s.content.slice(0, 50)}...`);
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`📝 Snippets ModMail (${list.length})`)
                .setDescription(lines.join('\n'));
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'delete') {
            const name = interaction.options.getString('nom');
            await this.service.deleteSnippet(guildId, name);
            return interaction.reply({ content: `✅ Snippet \`${name}\` supprimé.`, ephemeral: true });
        }
    }
}

const replyBuilder = new SlashCommandBuilder()
    .setName('reply')
    .setDescription('Répondre au membre dans le fil ModMail')
    .addStringOption(o => o.setName('message').setDescription('Le message à envoyer').setRequired(true).setMaxLength(2000))
    .addStringOption(o => o.setName('image').setDescription('URL d’une image d’illustration').setRequired(false));

const areplyBuilder = new SlashCommandBuilder()
    .setName('areply')
    .setDescription('Répondre anonymement au membre dans le fil ModMail (Staff de Serveur)')
    .addStringOption(o => o.setName('message').setDescription('Le message à envoyer anonymement').setRequired(true).setMaxLength(2000))
    .addStringOption(o => o.setName('image').setDescription('URL d’une image d’illustration').setRequired(false));

const closeBuilder = new SlashCommandBuilder()
    .setName('mail-close')
    .setDescription('Clôturer le fil ModMail actuel')
    .addStringOption(o => o.setName('raison').setDescription('Raison de la fermeture').setRequired(false));

const banBuilder = new SlashCommandBuilder()
    .setName('mail-ban')
    .setDescription('Bannir un membre de l’utilisation du ModMail')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('membre').setDescription('Le membre à bannir').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison du ban').setRequired(false));

const unbanBuilder = new SlashCommandBuilder()
    .setName('mail-unban')
    .setDescription('Débannir un membre du ModMail')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('membre').setDescription('Le membre à débannir').setRequired(true));

const snippetBuilder = new SlashCommandBuilder()
    .setName('snippet')
    .setDescription('Gestion des réponses rapides prédéfinies ModMail')
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter un snippet')
            .addStringOption(o => o.setName('nom').setDescription('Nom court du snippet').setRequired(true))
            .addStringOption(o => o.setName('contenu').setDescription('Texte de la réponse').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('use')
            .setDescription('Envoyer un snippet dans le fil ModMail')
            .addStringOption(o => o.setName('nom').setDescription('Nom du snippet').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les snippets disponibles')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un snippet')
            .addStringOption(o => o.setName('nom').setDescription('Nom du snippet').setRequired(true))
    );

Command({ name: 'reply', builder: replyBuilder })(ModMailCommands.prototype, 'executeReply');
Command({ name: 'areply', builder: areplyBuilder })(ModMailCommands.prototype, (inst, interaction) => inst.executeReply(interaction, true));
Command({ name: 'mail-close', builder: closeBuilder })(ModMailCommands.prototype, 'executeClose');
Command({ name: 'mail-ban', builder: banBuilder })(ModMailCommands.prototype, 'executeBan');
Command({ name: 'mail-unban', builder: unbanBuilder })(ModMailCommands.prototype, 'executeUnban');
Command({ name: 'snippet', builder: snippetBuilder })(ModMailCommands.prototype, 'executeSnippetMain');

module.exports = { ModMailCommands };
