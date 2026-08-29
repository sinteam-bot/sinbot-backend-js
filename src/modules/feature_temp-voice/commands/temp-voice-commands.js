/**
 * /tempvoice show|set|add-channel|remove-channel|list
 * (admin : ManageGuild)
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { TempVoiceService } = require('../services/temp-voice.service.js');

class TempVoiceCommands {
    static inject = [TempVoiceService];

    static __commandBuilder = new SlashCommandBuilder()
        .setName('tempvoice')
        .setDescription('Configuration des salons vocaux temporaires (Join-to-Create)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('show')
                .setDescription('Afficher la configuration des vocaux temporaires')
        )
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Modifier la configuration des vocaux temporaires')
                .addChannelOption(o => o.setName('category').setDescription('Catégorie parente').setRequired(false).addChannelTypes(ChannelType.GuildCategory))
                .addStringOption(o => o.setName('format').setDescription('Template du nom ({user} ou {username})').setRequired(false).setMaxLength(100))
                .addIntegerOption(o => o.setName('delay').setDescription('Délai de suppression en secondes').setRequired(false).setMinValue(0).setMaxValue(300))
                .addIntegerOption(o => o.setName('max').setDescription('Max vocaux simultanés (0 = illimité)').setRequired(false).setMinValue(0).setMaxValue(50))
                .addStringOption(o => o.setName('enabled').setDescription('Activer / désactiver').setRequired(false).addChoices(
                    { name: 'activé', value: 'true' },
                    { name: 'désactivé', value: 'false' }
                ))
        )
        .addSubcommand(sub =>
            sub.setName('add-channel')
                .setDescription('Ajouter un salon vocal Join-to-Create')
                .addChannelOption(o => o.setName('channel').setDescription('Salon vocal à activer').setRequired(true).addChannelTypes(ChannelType.GuildVoice))
        )
        .addSubcommand(sub =>
            sub.setName('remove-channel')
                .setDescription('Retirer un salon vocal Join-to-Create')
                .addChannelOption(o => o.setName('channel').setDescription('Salon vocal à retirer').setRequired(true).addChannelTypes(ChannelType.GuildVoice))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Lister les vocaux temporaires actifs')
        );

    constructor(service) {
        this.service = service;
    }

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'show':           return this.executeShow(interaction);
            case 'set':            return this.executeSet(interaction);
            case 'add-channel':    return this.executeAddChannel(interaction);
            case 'remove-channel': return this.executeRemoveChannel(interaction);
            case 'list':           return this.executeList(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
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
        await this.service.setConfig(interaction.guild.id, patch);
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

Command({ name: 'tempvoice', description: 'Configuration des salons vocaux temporaires' })(TempVoiceCommands.prototype, 'execute');

module.exports = { TempVoiceCommands };
