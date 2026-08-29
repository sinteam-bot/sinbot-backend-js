/**
 * feature_invites/commands/invite-commands.js
 *
 * Slash command `/invite` avec subcommands :
 *  - /invite stats [@user]
 *  - /invite leaderboard [page]
 *  - /invite info [@user]
 *  - /invite add <user> <amount> [reason]   (admin)
 *  - /invite remove <user> <amount> [reason] (admin)
 *  - /invite reset <user|all>
 *  - /invite restore <user|all>
 *  - /invite create [channel] [user]
 *  - /invite logs <join|leave> <channel>
 *  - /invite fake <setting> [value]
 *  - /invite blacklist <add|remove|list> <user|role>
 *  - /invite config <key> [value]
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { InvitesService } = require('../services/invites.service.js');

const ALLOWED_FAKE_KEYS = new Set([
    'account_age_threshold', 'no_avatar', 'duplicate_ip'
]);

class InviteCommands {
    static inject = [InvitesService];

    constructor(service) {
        this.service = service;
    }

    static __commandBuilder = new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Suivi des invitations du serveur (InviteLogger-like)')
        .addSubcommand((sub) =>
            sub.setName('stats')
                .setDescription('Affiche le nombre d\'invitations d\'un membre (ou de vous-même)')
                .addUserOption((opt) => opt.setName('user').setDescription('Membre (par défaut vous-même)').setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('leaderboard')
                .setDescription('Affiche le classement des invites')
                .addIntegerOption((opt) => opt.setName('page').setDescription('Page').setMinValue(1).setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('info')
                .setDescription('Détails des invitations d\'un membre')
                .addUserOption((opt) => opt.setName('user').setDescription('Membre').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub.setName('add')
                .setDescription('[Admin] Ajoute des bonus invites à un membre')
                .addUserOption((opt) => opt.setName('user').setDescription('Membre').setRequired(true))
                .addIntegerOption((opt) => opt.setName('amount').setDescription('Nombre d\'invites à ajouter').setMinValue(1).setRequired(true))
                .addStringOption((opt) => opt.setName('reason').setDescription('Raison').setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('remove')
                .setDescription('[Admin] Retire des bonus invites à un membre')
                .addUserOption((opt) => opt.setName('user').setDescription('Membre').setRequired(true))
                .addIntegerOption((opt) => opt.setName('amount').setDescription('Nombre d\'invites à retirer').setMinValue(1).setRequired(true))
                .addStringOption((opt) => opt.setName('reason').setDescription('Raison').setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('reset')
                .setDescription('[Admin] Réinitialise les comptes d\'invites')
                .addStringOption((opt) =>
                    opt.setName('target')
                        .setDescription('Utilisateur (@user) ou "all" pour tout le serveur')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('restore')
                .setDescription('[Admin] Restaure les comptes depuis un snapshot')
                .addStringOption((opt) =>
                    opt.setName('target')
                        .setDescription('Utilisateur (@user) ou "all"')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('create')
                .setDescription('Crée une invitation permanente via le bot')
                .addChannelOption((opt) => opt.setName('channel').setDescription('Salon (par défaut le 1er salon textuel)').setRequired(false))
                .addUserOption((opt) => opt.setName('target_user').setDescription('Max uses 1 pour ce membre').setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('logs')
                .setDescription('[Admin] Définit le salon de log des joins/leaves')
                .addStringOption((opt) =>
                    opt.setName('type')
                        .setDescription('Type de log')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Join', value: 'join' },
                            { name: 'Leave', value: 'leave' }
                        )
                )
                .addChannelOption((opt) => opt.setName('channel').setDescription('Salon').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub.setName('fake')
                .setDescription('[Admin] Configure la détection de fake invites')
                .addStringOption((opt) =>
                    opt.setName('setting')
                        .setDescription('Paramètre')
                        .setRequired(true)
                        .addChoices(
                            { name: 'account_age_threshold (jours)', value: 'account_age_threshold' },
                            { name: 'no_avatar (on/off)', value: 'no_avatar' },
                            { name: 'duplicate_ip (on/off)', value: 'duplicate_ip' }
                        )
                )
                .addStringOption((opt) => opt.setName('value').setDescription('Valeur (nombre, on/off, true/false)').setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('blacklist')
                .setDescription('[Admin] Blacklist un membre ou un rôle du leaderboard')
                .addStringOption((opt) =>
                    opt.setName('action')
                        .setDescription('Action')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Add member', value: 'add-member' },
                            { name: 'Add role', value: 'add-role' },
                            { name: 'Remove', value: 'remove' },
                            { name: 'List', value: 'list' }
                        )
                )
                .addStringOption((opt) => opt.setName('target_id').setDescription('ID du membre/rôle (requis sauf pour list)').setRequired(false))
                .addStringOption((opt) => opt.setName('reason').setDescription('Raison').setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('config')
                .setDescription('[Admin] Affiche ou modifie la configuration')
                .addStringOption((opt) => opt.setName('key').setDescription('Clé (ex: embed_color, show_account_age)').setRequired(false))
                .addStringOption((opt) => opt.setName('value').setDescription('Valeur').setRequired(false))
        );

    async _isEnabled(guildId) {
        const state = await featureRegistry.get(guildId, 'invites');
        return state && state.enabled ? state.config : null;
    }

    _isAdmin(interaction) {
        return interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    }

    async execute(interaction) {
        const config = await this._isEnabled(interaction.guildId);
        if (!config) {
            return interaction.reply({
                content: '❌ Le suivi des invites est désactivé sur ce serveur.',
                flags: MessageFlags.Ephemeral
            });
        }

        const sub = interaction.options.getSubcommand();
        try {
            switch (sub) {
                case 'stats':       return this._stats(interaction, config);
                case 'leaderboard': return this._leaderboard(interaction, config);
                case 'info':        return this._info(interaction, config);
                case 'add':         return this._add(interaction, config);
                case 'remove':      return this._remove(interaction, config);
                case 'reset':       return this._reset(interaction, config);
                case 'restore':     return this._restore(interaction, config);
                case 'create':      return this._create(interaction, config);
                case 'logs':        return this._logs(interaction, config);
                case 'fake':        return this._fake(interaction, config);
                case 'blacklist':   return this._blacklist(interaction, config);
                case 'config':      return this._config(interaction, config);
                default:
                    return interaction.reply({ content: '❌ Subcommand inconnue.', flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            console.error(`[InviteCommands] sub=${sub}:`, e);
            const msg = { content: `❌ Erreur: ${e.message}`, flags: MessageFlags.Ephemeral };
            return interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
        }
    }

    async _stats(interaction, config) {
        const user = interaction.options.getUser('user') || interaction.user;
        const stats = await this.service.getUserStats(interaction.guildId, user.id);
        const blacklisted = await this.service.repo.isBlacklisted(interaction.guildId, user.id);

        const embed = new EmbedBuilder()
            .setColor(config.embed_color || '#2F3136')
            .setTitle(`📨 Invitations de ${user.username}`)
            .setThumbnail(user.displayAvatarURL?.() || user.defaultAvatarURL)
            .addFields(
                { name: 'Total', value: String(stats.total), inline: true },
                { name: 'Réelles', value: String(stats.real), inline: true },
                { name: 'Bonus', value: String(stats.bonus), inline: true },
                { name: 'Leaves', value: String(stats.leaves), inline: true },
                { name: 'Fakes', value: String(stats.fake), inline: true }
            );

        if (blacklisted) {
            embed.setFooter({ text: '⛔ Ce membre est blacklisté du leaderboard.' });
        }

        return interaction.reply({ embeds: [embed] });
    }

    async _leaderboard(interaction, config) {
        const page = interaction.options.getInteger('page') || 1;
        const pageSize = config.leaderboard?.page_size || 25;
        const all = await this.service.getLeaderboard(interaction.guildId, 1000);
        const filtered = all.filter(u => !u.blacklisted);
        const start = (page - 1) * pageSize;
        const slice = filtered.slice(start, start + pageSize);

        const embed = new EmbedBuilder()
            .setColor(config.embed_color || '#2F3136')
            .setTitle('🏆 Classement des invitations')
            .setFooter({ text: `Page ${page} • ${filtered.length} membres` });

        if (slice.length === 0) {
            embed.setDescription('Aucun membre à afficher.');
        } else {
            const lines = await Promise.all(slice.map(async (u, i) => {
                const rank = start + i + 1;
                const mention = `<@${u.inviterId}>`;
                return `**#${rank}** ${mention} — ${u.total} (${u.real} réel${u.real > 1 ? 's' : ''} + ${u.bonus} bonus)`;
            }));
            embed.setDescription(lines.join('\n'));
        }

        return interaction.reply({ embeds: [embed] });
    }

    async _info(interaction, config) {
        const user = interaction.options.getUser('user');
        const info = await this.service.getUserInfo(interaction.guildId, user.id);

        const embed = new EmbedBuilder()
            .setColor(config.embed_color || '#2F3136')
            .setTitle(`ℹ️ Invitations de ${user.username}`)
            .setThumbnail(user.displayAvatarURL?.() || user.defaultAvatarURL)
            .addFields(
                { name: 'Total', value: String(info.stats.total), inline: true },
                { name: 'Réelles', value: String(info.stats.real), inline: true },
                { name: 'Bonus', value: String(info.stats.bonus), inline: true },
                { name: 'Leaves', value: String(info.stats.leaves), inline: true },
                { name: 'Fakes', value: String(info.stats.fake), inline: true }
            );

        if (info.bonuses.length > 0) {
            const bonusLines = info.bonuses
                .slice(-5)
                .map(b => `+${b.amount} — ${b.reason || 'pas de raison'} (par <@${b.moderatorId || 'unknown'}>)`)
                .join('\n');
            embed.addFields({ name: '📋 Derniers bonus', value: bonusLines });
        }

        if (info.invited.length > 0) {
            const recent = info.invited
                .slice(-10)
                .map(i => `<@${i.invitedId}> (${i.leftAt ? 'quitté' : 'présent'})${i.isFake ? ' ⚠️' : ''}`)
                .join('\n');
            embed.addFields({ name: '👥 Invités récents', value: recent });
        }

        return interaction.reply({ embeds: [embed] });
    }

    async _add(interaction, config) {
        if (!this._isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Admin requis.', flags: MessageFlags.Ephemeral });
        }
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');
        await this.service.addBonus(interaction.guildId, user.id, amount, reason, interaction.user.id);
        return interaction.reply({ content: `✅ +${amount} bonus invites ajoutés à <@${user.id}>.` });
    }

    async _remove(interaction, config) {
        if (!this._isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Admin requis.', flags: MessageFlags.Ephemeral });
        }
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');
        await this.service.addBonus(interaction.guildId, user.id, -amount, reason, interaction.user.id);
        return interaction.reply({ content: `✅ -${amount} bonus invites retirés à <@${user.id}>.` });
    }

    async _reset(interaction, config) {
        if (!this._isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Admin requis.', flags: MessageFlags.Ephemeral });
        }
        const target = interaction.options.getString('target');
        if (target === 'all') {
            await this.service.resetGuild(interaction.guildId);
            return interaction.reply({ content: '✅ Tous les comptes d\'invites ont été réinitialisés (snapshot créé).' });
        }
        const userId = target.replace(/[<@!>]/g, '');
        await this.service.resetUser(interaction.guildId, userId);
        return interaction.reply({ content: `✅ Compte d'invites de <@${userId}> réinitialisé (snapshot créé).` });
    }

    async _restore(interaction, config) {
        if (!this._isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Admin requis.', flags: MessageFlags.Ephemeral });
        }
        const target = interaction.options.getString('target');
        if (target === 'all') {
            const n = await this.service.restoreGuild(interaction.guildId);
            return interaction.reply({ content: `✅ ${n} snapshot(s) restauré(s).` });
        }
        const userId = target.replace(/[<@!>]/g, '');
        const snap = await this.service.restoreUser(interaction.guildId, userId);
        if (!snap) return interaction.reply({ content: '❌ Aucun snapshot trouvé pour cet utilisateur.' });
        return interaction.reply({ content: `✅ Snapshot de <@${userId}> restauré.` });
    }

    async _create(interaction, config) {
        if (!this._isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Admin requis.', flags: MessageFlags.Ephemeral });
        }
        const channel = interaction.options.getChannel('channel') ||
            interaction.guild.channels.cache.find(c => c.isTextBased?.());
        const target = interaction.options.getUser('target_user');

        if (!channel) {
            return interaction.reply({ content: '❌ Aucun salon textuel trouvé.', flags: MessageFlags.Ephemeral });
        }

        try {
            const invite = await channel.createInvite({
                maxAge: 0,
                maxUses: target ? 1 : 0,
                unique: true,
                reason: `Invite créée par ${interaction.user.tag} via /invite create`
            });
            return interaction.reply({ content: `🔗 Invitation créée : https://discord.gg/${invite.code}` });
        } catch (e) {
            return interaction.reply({ content: `❌ Erreur création d'invite: ${e.message}`, flags: MessageFlags.Ephemeral });
        }
    }

    async _logs(interaction, config) {
        if (!this._isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Admin requis.', flags: MessageFlags.Ephemeral });
        }
        const type = interaction.options.getString('type');
        const channel = interaction.options.getChannel('channel');

        const current = await featureRegistry.get(interaction.guildId, 'invites');
        const newConfig = { ...current.config };
        if (type === 'join') newConfig.join_log_channel_id = channel.id;
        else newConfig.leave_log_channel_id = channel.id;

        await featureRegistry.update(interaction.guildId, 'invites', { config: newConfig });
        return interaction.reply({ content: `✅ Salon de log ${type} défini sur <#${channel.id}>.` });
    }

    async _fake(interaction, config) {
        if (!this._isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Admin requis.', flags: MessageFlags.Ephemeral });
        }
        const setting = interaction.options.getString('setting');
        const value = interaction.options.getString('value');

        const current = await featureRegistry.get(interaction.guildId, 'invites');
        const newConfig = { ...current.config };
        if (setting === 'account_age_threshold') {
            const n = parseInt(value, 10);
            if (isNaN(n) || n < 0) return interaction.reply({ content: '❌ Nombre invalide.', flags: MessageFlags.Ephemeral });
            newConfig.fake_account_threshold_days = n;
        } else if (setting === 'no_avatar') {
            newConfig.fake_no_avatar = ['on', 'true', '1'].includes((value || 'on').toLowerCase());
        } else if (setting === 'duplicate_ip') {
            newConfig.fake_duplicate_ip = ['on', 'true', '1'].includes((value || 'on').toLowerCase());
        }
        await featureRegistry.update(interaction.guildId, 'invites', { config: newConfig });
        return interaction.reply({ content: `✅ Paramètre \`${setting}\` mis à jour.` });
    }

    async _blacklist(interaction, config) {
        if (!this._isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Admin requis.', flags: MessageFlags.Ephemeral });
        }
        const action = interaction.options.getString('action');
        if (action === 'list') {
            const list = await this.service.getBlacklist(interaction.guildId);
            if (list.length === 0) return interaction.reply('Aucun élément blacklisté.');
            const lines = list.map(b => `<@&${b.targetId}> / <@${b.targetId}> (${b.targetType}) — ${b.reason || 'pas de raison'}`);
            return interaction.reply({ content: lines.join('\n') });
        }
        const targetId = (interaction.options.getString('target_id') || '').replace(/[<@!&#>]/g, '');
        if (!targetId) return interaction.reply({ content: '❌ target_id requis.', flags: MessageFlags.Ephemeral });
        const reason = interaction.options.getString('reason');
        if (action === 'remove') {
            await this.service.removeBlacklist(interaction.guildId, targetId);
            return interaction.reply({ content: `✅ ${targetId} retiré de la blacklist.` });
        }
        const type = action === 'add-role' ? 'role' : 'user';
        await this.service.addBlacklist(interaction.guildId, targetId, type, reason, interaction.user.id);
        return interaction.reply({ content: `✅ ${type} ${targetId} blacklisté.` });
    }

    async _config(interaction, config) {
        if (!this._isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Admin requis.', flags: MessageFlags.Ephemeral });
        }
        const key = interaction.options.getString('key');
        const value = interaction.options.getString('value');

        if (!key) {
            const lines = Object.entries(config).map(([k, v]) => {
                if (typeof v === 'object' && v !== null) {
                    return `• **${k}**: \`${JSON.stringify(v)}\``;
                }
                return `• **${k}**: \`${v}\``;
            });
            const embed = new EmbedBuilder()
                .setColor(config.embed_color || '#2F3136')
                .setTitle('⚙️ Configuration du feature Invites')
                .setDescription(lines.join('\n'));
            return interaction.reply({ embeds: [embed] });
        }

        if (value === undefined) {
            return interaction.reply({ content: `ℹ️ \`${key}\` = \`${config[key]}\``, flags: MessageFlags.Ephemeral });
        }

        const current = await featureRegistry.get(interaction.guildId, 'invites');
        const newConfig = { ...current.config };
        let parsed = value;
        if (value === 'true') parsed = true;
        else if (value === 'false') parsed = false;
        else if (/^-?\d+(\.\d+)?$/.test(value)) parsed = parseFloat(value);

        newConfig[key] = parsed;
        await featureRegistry.update(interaction.guildId, 'invites', { config: newConfig });
        return interaction.reply({ content: `✅ \`${key}\` = \`${parsed}\`` });
    }
}

Command({ name: 'invite', description: 'Suivi des invites' })(InviteCommands.prototype, 'execute');

module.exports = { InviteCommands };
