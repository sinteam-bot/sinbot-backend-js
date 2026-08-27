/**
 * Toutes les commandes /mod-* de la feature AutoMod
 * Regroupées dans un seul fichier pour limiter la duplication.
 *
 * Commandes exposées :
 *   /mod-warn    : avertir un utilisateur
 *   /mod-mute    : timeout un utilisateur
 *   /mod-kick    : kicker un utilisateur
 *   /mod-ban     : bannir un utilisateur
 *   /mod-unban   : débannir (par user ID)
 *   /mod-history : afficher les 20 dernières actions contre un user
 *   /mod-clear   : supprimer N messages (1-100)
 */

const { Command, getConfig } = require('../../../core/index.js');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Sanctions, parseDuration } = require('../services/sanctions.service.js');
const { ModLog } = require('../services/mod-log.service.js');
const { requireModPermission, replyError } = require('./_helpers.js');
const { db } = require('../../../db/index.js');

// =================== /mod-warn ===================
class ModWarnCommand {
    static __commandBuilder = new SlashCommandBuilder()
        .setName('mod-warn')
        .setDescription('Avertir un utilisateur')
        .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(true).setMaxLength(512))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

    static inject = [Sanctions, ModLog];
    constructor(s, m) { this.sanctions = s; this.modLog = m; }

    async execute(interaction) {
        const cfg = getConfig().features?.automod || {};
        if (!requireModPermission(interaction, cfg.allowed_roles || []).ok) return replyError(interaction, 'Permissions insuffisantes');
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const { id } = await this.sanctions.warn(interaction.guild, target, interaction.user, reason, 'manual');
        return interaction.reply({ content: `✅ Avertissement créé pour **${target.tag}** (#${id.slice(0, 8)}).` });
    }
}
Command({ name: 'mod-warn' })(ModWarnCommand.prototype, 'execute');

// =================== /mod-mute ===================
class ModMuteCommand {
    static __commandBuilder = new SlashCommandBuilder()
        .setName('mod-mute')
        .setDescription('Timeout un utilisateur')
        .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
        .addStringOption(o => o.setName('duration').setDescription('Durée (ex: 1h, 30m, 1d)').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(false).setMaxLength(512))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

    static inject = [Sanctions];
    constructor(s) { this.sanctions = s; }

    async execute(interaction) {
        const cfg = getConfig().features?.automod || {};
        if (!requireModPermission(interaction, cfg.allowed_roles || []).ok) return replyError(interaction, 'Permissions insuffisantes');
        const target = interaction.options.getUser('user');
        const duration = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'Pas de raison fournie';
        const ms = parseDuration(duration);
        if (!ms) return replyError(interaction, 'Durée invalide (formats: 30s, 5m, 1h, 1d)');
        if (ms > 28 * 86_400_000) return replyError(interaction, 'Durée max 28 jours (limite Discord)');
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return replyError(interaction, 'Membre introuvable');
        const { id } = await this.sanctions.mute(interaction.guild, member, interaction.user, ms, reason);
        return interaction.reply({ content: `✅ ${target.tag} timeout pour ${duration} (#${id.slice(0, 8)}).` });
    }
}
Command({ name: 'mod-mute' })(ModMuteCommand.prototype, 'execute');

// =================== /mod-kick ===================
class ModKickCommand {
    static __commandBuilder = new SlashCommandBuilder()
        .setName('mod-kick')
        .setDescription('Kicker un utilisateur')
        .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(true).setMaxLength(512))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

    static inject = [Sanctions];
    constructor(s) { this.sanctions = s; }

    async execute(interaction) {
        const cfg = getConfig().features?.automod || {};
        if (!requireModPermission(interaction, cfg.allowed_roles || []).ok) return replyError(interaction, 'Permissions insuffisantes');
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return replyError(interaction, 'Membre introuvable');
        const { id } = await this.sanctions.kick(interaction.guild, member, interaction.user, reason);
        return interaction.reply({ content: `✅ ${target.tag} kické (#${id.slice(0, 8)}).` });
    }
}
Command({ name: 'mod-kick' })(ModKickCommand.prototype, 'execute');

// =================== /mod-ban ===================
class ModBanCommand {
    static __commandBuilder = new SlashCommandBuilder()
        .setName('mod-ban')
        .setDescription('Bannir un utilisateur')
        .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(true).setMaxLength(512))
        .addStringOption(o => o.setName('duration').setDescription('Durée (vide = permanent)').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

    static inject = [Sanctions];
    constructor(s) { this.sanctions = s; }

    async execute(interaction) {
        const cfg = getConfig().features?.automod || {};
        if (!requireModPermission(interaction, cfg.allowed_roles || []).ok) return replyError(interaction, 'Permissions insuffisantes');
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const duration = interaction.options.getString('duration');
        const durationMs = duration ? parseDuration(duration) : null;
        if (duration && !durationMs) return replyError(interaction, 'Durée invalide');
        const { id } = await this.sanctions.ban(interaction.guild, target, interaction.user, reason, durationMs);
        return interaction.reply({ content: `✅ ${target.tag} banni (#${id.slice(0, 8)}).` });
    }
}
Command({ name: 'mod-ban' })(ModBanCommand.prototype, 'execute');

// =================== /mod-unban ===================
class ModUnbanCommand {
    static __commandBuilder = new SlashCommandBuilder()
        .setName('mod-unban')
        .setDescription('Débannir un utilisateur par ID')
        .addStringOption(o => o.setName('user_id').setDescription('ID Discord').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(true).setMaxLength(512))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

    static inject = [Sanctions];
    constructor(s) { this.sanctions = s; }

    async execute(interaction) {
        const cfg = getConfig().features?.automod || {};
        if (!requireModPermission(interaction, cfg.allowed_roles || []).ok) return replyError(interaction, 'Permissions insuffisantes');
        const userId = interaction.options.getString('user_id');
        const reason = interaction.options.getString('reason');
        if (!/^\d{17,20}$/.test(userId)) return replyError(interaction, 'ID Discord invalide');
        await this.sanctions.unban(interaction.guild, userId, interaction.user, reason);
        return interaction.reply({ content: `✅ Utilisateur ${userId} débanni.` });
    }
}
Command({ name: 'mod-unban' })(ModUnbanCommand.prototype, 'execute');

// =================== /mod-history ===================
class ModHistoryCommand {
    static __commandBuilder = new SlashCommandBuilder()
        .setName('mod-history')
        .setDescription('Historique de modération d\'un utilisateur')
        .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

    static inject = [];
    constructor() {}

    async execute(interaction) {
        const cfg = getConfig().features?.automod || {};
        if (!requireModPermission(interaction, cfg.allowed_roles || []).ok) return replyError(interaction, 'Permissions insuffisantes');
        const target = interaction.options.getUser('user');
        const warns = await db.pool.query(
            `SELECT id, reason, source, rule, created_at FROM user_warnings WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 20`,
            [interaction.guild.id, target.id]
        );
        const sans = await db.pool.query(
            `SELECT id, type, reason, duration_ms, active, created_at FROM user_sanctions WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 20`,
            [interaction.guild.id, target.id]
        );

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle(`📜 Historique — ${target.tag}`)
            .setColor(0x5865f2)
            .setTimestamp();

        const wRows = warns.rows || [];
        const sRows = sans.rows || [];
        if (wRows.length === 0 && sRows.length === 0) {
            embed.setDescription('Aucun historique.');
        } else {
            if (wRows.length) {
                embed.addFields({
                    name: `⚠️ Avertissements (${wRows.length})`,
                    value: wRows.slice(0, 5).map(w => `• <t:${Math.floor(w.created_at/1000)}:R> — ${w.source}${w.rule ? ` (${w.rule})` : ''} : ${String(w.reason).slice(0, 80)}`).join('\n').slice(0, 1024) || '—'
                });
            }
            if (sRows.length) {
                embed.addFields({
                    name: `🔨 Sanctions (${sRows.length})`,
                    value: sRows.slice(0, 5).map(s => `• <t:${Math.floor(s.created_at/1000)}:R> — **${s.type}** : ${String(s.reason).slice(0, 80)}${s.active ? '' : ' _(révoquée)_'}`).join('\n').slice(0, 1024) || '—'
                });
            }
        }
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}
Command({ name: 'mod-history' })(ModHistoryCommand.prototype, 'execute');

// =================== /mod-clear ===================
class ModClearCommand {
    static __commandBuilder = new SlashCommandBuilder()
        .setName('mod-clear')
        .setDescription('Supprimer N messages dans le salon courant')
        .addIntegerOption(o => o.setName('amount').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption(o => o.setName('user').setDescription('Filtrer par utilisateur').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

    static inject = [];
    constructor() {}

    async execute(interaction) {
        const cfg = getConfig().features?.automod || {};
        if (!requireModPermission(interaction, cfg.allowed_roles || []).ok) return replyError(interaction, 'Permissions insuffisantes');
        const amount = interaction.options.getInteger('amount');
        const user = interaction.options.getUser('user');
        const channel = interaction.channel;
        await interaction.deferReply({ ephemeral: true });

        try {
            let messages = await channel.messages.fetch({ limit: amount + 5 });
            if (user) messages = messages.filter(m => m.author.id === user.id);
            messages = [...messages.values()].slice(0, amount);
            const deleted = await channel.bulkDelete(messages, true);
            return interaction.editReply({ content: `🗑️ ${deleted.size} message(s) supprimé(s).` });
        } catch (err) {
            return interaction.editReply({ content: `❌ Erreur: ${err.message}` });
        }
    }
}
Command({ name: 'mod-clear' })(ModClearCommand.prototype, 'execute');

module.exports = {
    ModWarnCommand,
    ModMuteCommand,
    ModKickCommand,
    ModBanCommand,
    ModUnbanCommand,
    ModHistoryCommand,
    ModClearCommand
};
