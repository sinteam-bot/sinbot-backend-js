/**
 * src/modules/automation_autothread/commands/thread.cmd.js
 *
 * Commandes Slash /thread et /autothread (Module P2).
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { AutoThreadService } = require('../services/autothread.service.js');

class ThreadCommands {
    static inject = [AutoThreadService];

    constructor(service) {
        this.service = service;
    }

    _isStaff(member) {
        return Boolean(
            member?.permissions?.has?.(PermissionFlagsBits.ManageThreads) ||
            member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) ||
            member?.permissions?.has?.(PermissionFlagsBits.Administrator)
        );
    }

    // =================== /thread ===================

    async executeThreadRename(interaction) {
        const newTitle = interaction.options.getString('titre');
        const isStaff = this._isStaff(interaction.member);

        const res = await this.service.renameThread(interaction.channel, newTitle, interaction.user.id, isStaff);
        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }

        return interaction.reply({ content: `✅ Le fil a été renommé en **"${res.name}"**.`, ephemeral: false });
    }

    async executeThreadClose(interaction) {
        const reason = interaction.options.getString('raison') || `Fermé par ${interaction.user.username}`;
        const isStaff = this._isStaff(interaction.member);

        const res = await this.service.closeThread(interaction.channel, interaction.user.id, isStaff, reason);
        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }

        await interaction.reply({ content: `🔒 Ce fil de discussion a été fermé (${reason}).` });
    }

    async executeThreadLock(interaction) {
        const reason = interaction.options.getString('raison') || `Verrouillé par ${interaction.user.username}`;
        const isStaff = this._isStaff(interaction.member);

        const res = await this.service.lockThread(interaction.channel, isStaff, reason);
        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }

        await interaction.reply({ content: `⛔ Ce fil a été verrouillé par la modération.` });
    }

    async executeThreadMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'rename': return this.executeThreadRename(interaction);
            case 'close':  return this.executeThreadClose(interaction);
            case 'lock':   return this.executeThreadLock(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }

    // =================== /autothread ===================

    async executeAutoThreadSet(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const channel = interaction.options.getChannel('salon');
        const titleFormat = interaction.options.getString('format_titre') || '{author} - {message}';
        const introMessage = interaction.options.getString('message_intro');
        const slowmode = interaction.options.getInteger('slowmode') || 0;
        const autoPin = interaction.options.getBoolean('auto_pin') || false;

        const res = await this.service.setChannel({
            guildId: interaction.guild.id,
            channelId: channel.id,
            titleFormat,
            introMessage,
            slowmodeSeconds: slowmode,
            autoPin,
            enabled: true
        });

        return interaction.reply({
            content: `🧵 Auto-Thread configuré pour <#${channel.id}> !\n• **Titre format :** \`${res.titleFormat}\`\n• **Slowmode :** ${res.slowmodeSeconds}s\n• **Auto-pin :** ${res.autoPin ? 'Oui' : 'Non'}`,
            ephemeral: true
        });
    }

    async executeAutoThreadList(interaction) {
        const list = await this.service.listChannels(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun salon auto-thread n\'est configuré sur ce serveur.', ephemeral: true });
        }

        const lines = list.map(c => `• <#${c.channelId}> — Format: \`${c.titleFormat}\` (Slowmode: ${c.slowmodeSeconds}s, Auto-pin: ${c.autoPin ? 'Oui' : 'Non'})`);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🧵 Salons Auto-Thread actifs (${list.length})`)
            .setDescription(lines.join('\n'));

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeAutoThreadRemove(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const channel = interaction.options.getChannel('salon');
        await this.service.removeChannel(interaction.guild.id, channel.id);

        return interaction.reply({ content: `✅ Auto-Thread désactivé pour <#${channel.id}>.`, ephemeral: true });
    }

    async executeAutoThreadMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'set':    return this.executeAutoThreadSet(interaction);
            case 'list':   return this.executeAutoThreadList(interaction);
            case 'remove': return this.executeAutoThreadRemove(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const threadBuilder = new SlashCommandBuilder()
    .setName('thread')
    .setDescription('Gestion rapide des fils de discussion (Threads)')
    .addSubcommand(sub =>
        sub.setName('rename')
            .setDescription('Renommer le fil de discussion actuel (créateur ou staff)')
            .addStringOption(o => o.setName('titre').setDescription('Nouveau titre pour le fil').setRequired(true).setMaxLength(100))
    )
    .addSubcommand(sub =>
        sub.setName('close')
            .setDescription('Fermer/archiver le fil de discussion')
            .addStringOption(o => o.setName('raison').setDescription('Raison de la fermeture').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('lock')
            .setDescription('Verrouiller définitivement le fil (staff)')
            .addStringOption(o => o.setName('raison').setDescription('Raison du verrouillage').setRequired(false))
    );

const autoThreadBuilder = new SlashCommandBuilder()
    .setName('autothread')
    .setDescription('Configuration de la création automatique de fils par salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('set')
            .setDescription('Activer l’auto-thread sur un salon')
            .addChannelOption(o => o.setName('salon').setDescription('Salon cible').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName('format_titre').setDescription('Format du titre (ex: {author} - {message})').setRequired(false))
            .addStringOption(o => o.setName('message_intro').setDescription('Message posté dans le fil (ex: Bienvenue dans ce fil {author})').setRequired(false))
            .addIntegerOption(o => o.setName('slowmode').setDescription('Délai de slowmode en secondes (0 pour désactiver)').setRequired(false).setMinValue(0).setMaxValue(21600))
            .addBooleanOption(o => o.setName('auto_pin').setDescription('Épingler le message initial dans le fil ?').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les salons auto-thread configurés')
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Désactiver l’auto-thread sur un salon')
            .addChannelOption(o => o.setName('salon').setDescription('Salon à désactiver').setRequired(true).addChannelTypes(ChannelType.GuildText))
    );

Command({ name: 'thread', builder: threadBuilder })(ThreadCommands.prototype, 'executeThreadMain');
Command({ name: 'autothread', builder: autoThreadBuilder })(ThreadCommands.prototype, 'executeAutoThreadMain');

module.exports = { ThreadCommands };
