/**
 * Slash commands XP — /rank, /leaderboard, /xp-set, /xp-add, /xp-reset
 *
 * /rank       : profil d'un utilisateur (niveau, rang, progression)
 * /leaderboard: top paginé (boutons ◀ ▶)
 * /xp-set     : fixe l'XP d'un utilisateur (admin)
 * /xp-add     : ajoute de l'XP (admin)
 * /xp-reset   : remet à zéro (admin)
 */

const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Command, getConfig } = require('../../core/index.js');
const { XPLevelService } = require('./xp-level.service.js');

const PER_PAGE = 10;

function requireAdmin(interaction) {
    return interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
}

function replyError(interaction, msg) {
    return interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
}

class XPLevelCommand {
    static inject = [XPLevelService];
    constructor(service) {
        this.service = service;
    }

    async executeRank(interaction) {
        const targetUser = interaction.options?.getUser?.('user') || interaction.user;
        const profile = await this.service.getUserProfile(targetUser.id, targetUser.username);

        const progressBar = this._buildProgressBar(profile.progress.progressPercent);
        const embed = new EmbedBuilder()
            .setColor('#f2c7ce')
            .setTitle(`⭐ Profil XP de ${profile.username}`)
            .setThumbnail(targetUser.displayAvatarURL?.({ dynamic: true }) || null)
            .addFields(
                { name: '🏆 Rang', value: profile.rank ? `#${profile.rank}` : 'Non classé', inline: true },
                { name: '🎖️ Niveau', value: `${profile.level}`, inline: true },
                { name: '✨ Total XP', value: `${profile.totalXp.toLocaleString('fr-FR')} XP`, inline: true },
                { name: '📊 Progression', value: `${progressBar}\n${profile.progress.xpInCurrentLevel.toLocaleString('fr-FR')} / ${profile.progress.xpNeededForNext.toLocaleString('fr-FR')} XP (${profile.progress.progressPercent}%)`, inline: false },
                { name: '💬 Messages', value: `${profile.messagesCount || 0}`, inline: true },
                { name: '🎤 Vocal', value: `${profile.voiceMinutes || 0} min`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    async executeLeaderboard(interaction) {
        await this._renderLeaderboard(interaction, 0);
    }

    async executeXpSet(interaction) {
        if (!requireAdmin(interaction)) return replyError(interaction, 'Admin uniquement');
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        await this.service.repo.updateUserXP(user.id, user.username, amount, this.service.calculateLevel(amount), false);
        await interaction.reply({ content: `✅ XP de ${user.tag} fixée à ${amount}.` });
    }

    async executeXpAdd(interaction) {
        if (!requireAdmin(interaction)) return replyError(interaction, 'Admin uniquement');
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason') || 'Ajustement admin';
        const result = await this.service.addXP(user.id, user.username, amount, 'admin_grant', reason);
        await interaction.reply({
            content: result.leveledUp
                ? `✅ +${amount} XP pour ${user.tag} (niveau ${result.newLevel} 🎉)`
                : `✅ +${amount} XP pour ${user.tag}.`
        });
    }

    async executeXpReset(interaction) {
        if (!requireAdmin(interaction)) return replyError(interaction, 'Admin uniquement');
        const user = interaction.options.getUser('user');
        const result = await this.service.repo.resetUserXP(user.id);
        if (result.reset) {
            await interaction.reply({ content: `✅ XP de ${user.tag} remise à zéro.` });
        } else {
            await interaction.reply({ content: `ℹ️ ${user.tag} n'avait pas d'XP enregistrée.`, ephemeral: true });
        }
    }

    async _renderLeaderboard(interaction, offset) {
        const { entries, total } = await this.service.getLeaderboard(PER_PAGE, offset);
        if (total === 0) {
            return interaction.reply({ content: '📊 Aucun membre dans le classement pour le moment.', ephemeral: true });
        }
        const lines = entries.map((u) => {
            const rank = offset + entries.indexOf(u) + 1;
            const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : '👤'));
            return `${medal} **#${rank} ${u.username}** — Niveau **${u.level}** (${u.totalXp.toLocaleString('fr-FR')} XP)`;
        });
        const page = Math.floor(offset / PER_PAGE) + 1;
        const pages = Math.ceil(total / PER_PAGE);
        const embed = new EmbedBuilder()
            .setColor('#f2c7ce')
            .setTitle('🏆 Classement XP')
            .setDescription(lines.join('\n'))
            .setFooter({ text: `Page ${page}/${pages} — ${total} membre(s) classé(s)` })
            .setTimestamp();

        const row = new ActionRowBuilder();
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`xp:lb:${Math.max(offset - PER_PAGE, 0)}`)
                .setLabel('◀ Précédent')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(offset === 0),
            new ButtonBuilder()
                .setCustomId(`xp:lb:${offset + PER_PAGE}`)
                .setLabel('Suivant ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(offset + PER_PAGE >= total)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    async handleLeaderboardButton(interaction) {
        const customId = interaction.customId || '';
        const m = customId.match(/^xp:lb:(\d+)$/);
        if (!m) return;
        const offset = parseInt(m[1], 10);
        const { entries, total } = await this.service.getLeaderboard(PER_PAGE, offset);
        const lines = entries.map((u) => {
            const rank = offset + entries.indexOf(u) + 1;
            const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : '👤'));
            return `${medal} **#${rank} ${u.username}** — Niveau **${u.level}** (${u.totalXp.toLocaleString('fr-FR')} XP)`;
        });
        const page = Math.floor(offset / PER_PAGE) + 1;
        const pages = Math.ceil(total / PER_PAGE);
        const embed = new EmbedBuilder()
            .setColor('#f2c7ce')
            .setTitle('🏆 Classement XP')
            .setDescription(lines.join('\n'))
            .setFooter({ text: `Page ${page}/${pages} — ${total} membre(s) classé(s)` })
            .setTimestamp();

        const row = new ActionRowBuilder();
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`xp:lb:${Math.max(offset - PER_PAGE, 0)}`)
                .setLabel('◀ Précédent')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(offset === 0),
            new ButtonBuilder()
                .setCustomId(`xp:lb:${offset + PER_PAGE}`)
                .setLabel('Suivant ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(offset + PER_PAGE >= total)
        );
        await interaction.update({ embeds: [embed], components: [row] });
    }

    async executeXpMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'rank':        return this.executeRank(interaction);
            case 'leaderboard': return this.executeLeaderboard(interaction);
            case 'set':         return this.executeXpSet(interaction);
            case 'add':         return this.executeXpAdd(interaction);
            case 'reset':       return this.executeXpReset(interaction);
            default:
                return this.executeRank(interaction);
        }
    }

    _buildProgressBar(percent, length = 16) {
        const filled = Math.round((percent / 100) * length);
        const empty = length - filled;
        return '▰'.repeat(filled) + '▱'.repeat(empty);
    }
}

// Slash command builders
const rankBuilder = new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Afficher votre niveau et votre progression d\'XP')
    .addUserOption(o => o.setName('user').setDescription('Utilisateur cible').setRequired(false));

const xpBuilder = new SlashCommandBuilder()
    .setName('xp')
    .setDescription('Système d\'XP et de niveaux')
    .addSubcommand(sub =>
        sub.setName('rank')
            .setDescription('Afficher votre niveau et votre progression d\'XP')
            .addUserOption(o => o.setName('user').setDescription('Utilisateur cible').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('leaderboard')
            .setDescription('Afficher le classement des membres les plus actifs')
    )
    .addSubcommand(sub =>
        sub.setName('set')
            .setDescription('Fixe l\'XP d\'un utilisateur (admin)')
            .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('XP cible').setRequired(true).setMinValue(0))
    )
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajoute de l\'XP à un utilisateur (admin)')
            .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Quantité').setRequired(true))
            .addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(false).setMaxLength(200))
    )
    .addSubcommand(sub =>
        sub.setName('reset')
            .setDescription('Remet à zéro l\'XP d\'un utilisateur (admin)')
            .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
    );

Command({ name: 'rank', builder: rankBuilder })(XPLevelCommand.prototype, 'executeRank');
Command({ name: 'xp', builder: xpBuilder })(XPLevelCommand.prototype, 'executeXpMain');
Command({ name: 'xp-lb-button' })(XPLevelCommand.prototype, 'handleLeaderboardButton');

module.exports = { XPLevelCommand };
