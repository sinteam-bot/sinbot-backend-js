/**
 * giveaways/commands/giveaway-commands.js
 *
 * Commandes slash pour les giveaways.
 *
 * Issue du split de game_engagement/ (Phase 9.2 du plan migrate-to-c12).
 */

const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { GiveawayService } = require('../services/giveaway.service.js');

function requireMod(interaction) {
    const member = interaction.member;
    if (!member) return false;
    return member.permissions?.has?.(PermissionFlagsBits.ManageMessages) || false;
}

class GiveawayCommands {
    static inject = [GiveawayService];
    constructor(service) { this.service = service; }

    async executeGiveawayStart(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const prize = interaction.options.getString('prize');
        const duration = interaction.options.getString('duration');
        const winners = interaction.options.getInteger('winners') || 1;
        const color = interaction.options.getString('color');
        const roleRequis = interaction.options.getRole('role_requis');

        const durationMs = this._parseDuration(duration);
        if (!durationMs) {
            return interaction.reply({ content: '❌ Durée invalide (ex: 1h, 30m, 1d)', ephemeral: true });
        }

        const cfg = getConfig().features?.giveaways || {};
        if (durationMs > (cfg.max_duration_days || 30) * 86_400_000) {
            return interaction.reply({ content: `❌ Durée max : ${cfg.max_duration_days || 30} jours`, ephemeral: true });
        }
        if (winners > (cfg.max_winners || 20)) {
            return interaction.reply({ content: `❌ Max gagnants : ${cfg.max_winners || 20}`, ephemeral: true });
        }

        try {
            const g = await this.service.create({
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                hostId: interaction.user.id,
                prize,
                description: null,
                winnersCount: winners,
                requiredRoleId: roleRequis ? roleRequis.id : null,
                durationMs,
                color: color || cfg.default_color || '#5865F2'
            });
            const embed = this.service.buildEmbed(g);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway:enter:${g.id}`)
                    .setLabel(cfg.button_label || 'Participer')
                    .setEmoji(cfg.button_emoji || '🎉')
                    .setStyle(ButtonStyle.Primary)
            );
            const sent = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
            await this.service.setMessageId(g.id, sent.id);
            return { id: g.id };
        } catch (err) {
            return interaction.editReply({ content: `❌ ${err.message}` });
        }
    }

    async executeGiveawayEnd(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const g = await this.service.end(id);
        if (!g) return interaction.reply({ content: '❌ Giveaway introuvable', ephemeral: true });
        const winners = (g.winners || []).map(id => `<@${id}>`).join(', ') || '_(aucun)_';
        return interaction.reply({ content: `🎉 Giveaway terminé. Gagnants : ${winners}` });
    }

    async executeGiveawayReroll(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const g = await this.service.get(id);
        if (!g) return interaction.reply({ content: '❌ Giveaway introuvable', ephemeral: true });
        if (g.status !== 'ended') {
            return interaction.reply({ content: '❌ Le giveaway n\'est pas encore terminé', ephemeral: true });
        }
        const { winners } = await this.service.draw(id);
        if (winners.length === 0) {
            return interaction.reply({ content: '❌ Aucun participant à retirer', ephemeral: true });
        }
        await this.service.updateGiveaway(id, { winners });
        const winnersText = winners.map(w => `<@${w}>`).join(', ');
        return interaction.reply({ content: `🎉 Nouveau tirage : ${winnersText}` });
    }

    async executeGiveawayShare(interaction) {
        const id = interaction.options.getString('id');
        const g = await this.service.get(id);
        if (!g) {
            return interaction.reply({ content: '❌ Giveaway introuvable', ephemeral: true });
        }
        const link = this.service.getShareLink(g);
        if (!link) {
            return interaction.reply({ content: '❌ Lien direct non disponible pour ce giveaway.', ephemeral: true });
        }
        return interaction.reply({
            content: `🔗 **Lien de partage pour "${g.prize}"** :\n${link}`,
            ephemeral: true
        });
    }

    async executeGiveawayList(interaction) {
        const list = await this.service.list({ guildId: interaction.guild.id, status: 'active', limit: 25 });
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun giveaway actif', ephemeral: true });
        }
        const lines = list.map(g => `• **${g.prize}** — se termine <t:${Math.floor(g.endsAt / 1000)}:R> (${g.winnersCount} gagnant(s))`);
        return interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }

    async executeGiveawayCancel(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const g = await this.service.cancel(id);
        if (!g) return interaction.reply({ content: '❌ Giveaway introuvable', ephemeral: true });
        return interaction.reply({ content: '✅ Giveaway annulé' });
    }

    _parseDuration(str) {
        const m = String(str || '').match(/^(\d+)\s*([smhd])$/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
        return n * mult;
    }
}

const giveawayStartBuilder = new SlashCommandBuilder()
    .setName('giveaway-start')
    .setDescription('Démarrer un giveaway')
    .addStringOption(o => o.setName('prize').setDescription('Lot à gagner').setRequired(true).setMaxLength(256))
    .addStringOption(o => o.setName('duration').setDescription('Durée (ex: 1h, 30m, 1d)').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Nombre de gagnants').setRequired(false).setMinValue(1).setMaxValue(20))
    .addRoleOption(o => o.setName('role_requis').setDescription('Rôle requis pour participer (optionnel)').setRequired(false))
    .addStringOption(o => o.setName('color').setDescription('Couleur hex (ex: #5865F2)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const giveawayEndBuilder = new SlashCommandBuilder()
    .setName('giveaway-end')
    .setDescription('Terminer un giveaway manuellement')
    .addStringOption(o => o.setName('id').setDescription('ID du giveaway').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const giveawayRerollBuilder = new SlashCommandBuilder()
    .setName('giveaway-reroll')
    .setDescription('Retirer un giveaway déjà terminé')
    .addStringOption(o => o.setName('id').setDescription('ID du giveaway').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const giveawayShareBuilder = new SlashCommandBuilder()
    .setName('giveaway-share')
    .setDescription('Obtenir le lien de partage d’un giveaway')
    .addStringOption(o => o.setName('id').setDescription('ID du giveaway').setRequired(true));

const giveawayListBuilder = new SlashCommandBuilder()
    .setName('giveaway-list')
    .setDescription('Lister les giveaways actifs');

const giveawayCancelBuilder = new SlashCommandBuilder()
    .setName('giveaway-cancel')
    .setDescription('Annuler un giveaway')
    .addStringOption(o => o.setName('id').setDescription('ID du giveaway').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

Command({ name: 'giveaway-start', builder: giveawayStartBuilder })(GiveawayCommands.prototype, 'executeGiveawayStart');
Command({ name: 'giveaway-end', builder: giveawayEndBuilder })(GiveawayCommands.prototype, 'executeGiveawayEnd');
Command({ name: 'giveaway-reroll', builder: giveawayRerollBuilder })(GiveawayCommands.prototype, 'executeGiveawayReroll');
Command({ name: 'giveaway-share', builder: giveawayShareBuilder })(GiveawayCommands.prototype, 'executeGiveawayShare');
Command({ name: 'giveaway-list', builder: giveawayListBuilder })(GiveawayCommands.prototype, 'executeGiveawayList');
Command({ name: 'giveaway-cancel', builder: giveawayCancelBuilder })(GiveawayCommands.prototype, 'executeGiveawayCancel');

module.exports = { GiveawayCommands };
