/**
 * /tempvoice-config, /tempvoice-list
 * (admin : ManageGuild)
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { TempVoiceService } = require('../services/temp-voice.service.js');

class TempVoiceCommands {
    static inject = [TempVoiceService];

    constructor(service) {
        this.service = service;
    }

    async executeShow(interaction) {
        if (!interaction.member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const cfg = await this.service.getConfig(interaction.guild.id);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🔊 Salons vocaux temporaires')
            .addFields(
                { name: 'Activé', value: cfg.enabled ? '✅' : '❌', inline: true },
                { name: 'Catégorie', value: cfg.categoryId ? `<#${cfg.categoryId}>` : 'aucune (racine)', inline: true },
                { name: 'Format', value: `\`${cfg.format}\``, inline: false },
                { name: 'Delay suppression', value: `${cfg.deleteDelaySeconds}s`, inline: true },
                { name: 'Max par guild', value: cfg.maxPerGuild || 'illimité', inline: true },
                { name: 'Join channels', value: (cfg.joinChannels || []).map(c => `<#${c}>`).join(', ') || 'aucun', inline: false }
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeSet(interaction) {
        if (!interaction.member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const category = interaction.options.getChannel('category');
        const format = interaction.options.getString('format');
        const delay = interaction.options.getInteger('delay');
        const max = interaction.options.getInteger('max');
        const enabled = interaction.options.getString('enabled');
        const patch = {};
        if (category) {
            if (category.type !== ChannelType.GuildCategory) {
                return interaction.reply({ content: '❌ Le salon doit être une catégorie', ephemeral: true });
            }
            patch.categoryId = category.id;
        }
        if (format) patch.format = format;
        if (delay !== null) patch.deleteDelaySeconds = delay;
        if (max !== null) patch.maxPerGuild = max;
        if (enabled !== null) patch.enabled = enabled === 'true';
        const data = await this.service.setConfig(interaction.guild.id, patch);
        return interaction.reply({ content: `✅ Configuration mise à jour.`, ephemeral: true });
    }

    async executeAddChannel(interaction) {
        if (!interaction.member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const channel = interaction.options.getChannel('channel');
        if (!channel || channel.type !== ChannelType.GuildVoice) {
            return interaction.reply({ content: '❌ Le salon doit être un salon vocal', ephemeral: true });
        }
        const cfg = await this.service.getConfig(interaction.guild.id);
        const list = Array.from(new Set([...(cfg.joinChannels || []), channel.id]));
        await this.service.setConfig(interaction.guild.id, { joinChannels: list });
        return interaction.reply({ content: `✅ ${channel} ajouté aux join-channels.`, ephemeral: true });
    }

    async executeRemoveChannel(interaction) {
        if (!interaction.member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const channel = interaction.options.getChannel('channel');
        const cfg = await this.service.getConfig(interaction.guild.id);
        const list = (cfg.joinChannels || []).filter(c => c !== channel.id);
        await this.service.setConfig(interaction.guild.id, { joinChannels: list });
        return interaction.reply({ content: `✅ ${channel} retiré des join-channels.`, ephemeral: true });
    }

    async executeList(interaction) {
        if (!interaction.member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '❌ Réservé aux admins', ephemeral: true });
        }
        const list = await this.service.listActive(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun salon temporaire actif.', ephemeral: true });
        }
        const lines = list.map(s => `• <#${s.channelId}> (créateur : <@${s.creatorId}>)`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🔊 Salons temporaires actifs (${list.length})`)
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

const showBuilder = new SlashCommandBuilder()
    .setName('tempvoice-show')
    .setDescription('Afficher la config des vocaux temporaires (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const setBuilder = new SlashCommandBuilder()
    .setName('tempvoice-set')
    .setDescription('Modifier la config des vocaux temporaires (admin)')
    .addChannelOption(o => o.setName('category').setDescription('Catégorie parente').setRequired(false).addChannelTypes(ChannelType.GuildCategory))
    .addStringOption(o => o.setName('format').setDescription('Template du nom ({user} ou {username})').setRequired(false).setMaxLength(100))
    .addIntegerOption(o => o.setName('delay').setDescription('Délai de suppression en secondes').setRequired(false).setMinValue(0).setMaxValue(300))
    .addIntegerOption(o => o.setName('max').setDescription('Max vocaux simultanés (0 = illimité)').setRequired(false).setMinValue(0).setMaxValue(50))
    .addStringOption(o => o.setName('enabled').setDescription('Activer / désactiver').setRequired(false).addChoices(
        { name: 'activé', value: 'true' },
        { name: 'désactivé', value: 'false' }
    ))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const addChannelBuilder = new SlashCommandBuilder()
    .setName('tempvoice-add-channel')
    .setDescription('Ajouter un Join-to-Create channel (admin)')
    .addChannelOption(o => o.setName('channel').setDescription('Salon vocal à activer').setRequired(true).addChannelTypes(ChannelType.GuildVoice))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const removeChannelBuilder = new SlashCommandBuilder()
    .setName('tempvoice-remove-channel')
    .setDescription('Retirer un Join-to-Create channel (admin)')
    .addChannelOption(o => o.setName('channel').setDescription('Salon vocal à retirer').setRequired(true).addChannelTypes(ChannelType.GuildVoice))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const listBuilder = new SlashCommandBuilder()
    .setName('tempvoice-list')
    .setDescription('Lister les vocaux temporaires actifs (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

Command({ name: 'tempvoice-show', builder: showBuilder })(TempVoiceCommands.prototype, 'executeShow');
Command({ name: 'tempvoice-set', builder: setBuilder })(TempVoiceCommands.prototype, 'executeSet');
Command({ name: 'tempvoice-add-channel', builder: addChannelBuilder })(TempVoiceCommands.prototype, 'executeAddChannel');
Command({ name: 'tempvoice-remove-channel', builder: removeChannelBuilder })(TempVoiceCommands.prototype, 'executeRemoveChannel');
Command({ name: 'tempvoice-list', builder: listBuilder })(TempVoiceCommands.prototype, 'executeList');

module.exports = { TempVoiceCommands };
