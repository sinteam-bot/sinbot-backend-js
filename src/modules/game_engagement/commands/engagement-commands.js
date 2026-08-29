/**
 * Slash commands /giveaway-* et /poll-*
 *
 * /giveaway-start [modal: prize, duration, winners]  : crée et envoie l'embed
 * /giveaway-end   [giveawayId]                          : termine manuellement
 * /giveaway-reroll [giveawayId]                        : retire au sort
 * /giveaway-list                                      : liste les giveaways actifs
 * /giveaway-cancel [giveawayId]                       : annule
 *
 * /poll-create  [modal: question, options, duration, multi]
 * /poll-end     [pollId]
 * /poll-list
 * /poll-delete  [pollId]
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { GiveawayService } = require('../services/giveaway.service.js');
const { PollService } = require('../services/poll.service.js');

function requireMod(interaction) {
    return interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages);
}

class EngagementCommands {
    static inject = [GiveawayService, PollService];

    constructor(giveaway, poll) {
        this.giveaway = giveaway;
        this.poll = poll;
    }

    // =================== /giveaway-start ===================

    async executeGiveawayStart(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const prize = interaction.options.getString('prize');
        const duration = interaction.options.getString('duration');
        const winners = interaction.options.getInteger('winners') || 1;
        const color = interaction.options.getString('color');

        const durationMs = this._parseDuration(duration);
        if (!durationMs) {
            return interaction.reply({ content: '❌ Durée invalide (ex: 1h, 30m, 1d)', ephemeral: true });
        }

        const cfg = getConfig().features?.engagement?.giveaways || {};
        if (durationMs > (cfg.max_duration_days || 30) * 86_400_000) {
            return interaction.reply({ content: `❌ Durée max : ${cfg.max_duration_days || 30} jours`, ephemeral: true });
        }
        if (winners > (cfg.max_winners || 20)) {
            return interaction.reply({ content: `❌ Max gagnants : ${cfg.max_winners || 20}`, ephemeral: true });
        }

        try {
            const g = await this.giveaway.create({
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                hostId: interaction.user.id,
                prize,
                description: null,
                winnersCount: winners,
                durationMs,
                color: color || cfg.default_color || '#5865F2'
            });
            const embed = this.giveaway.buildEmbed(g);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway:enter:${g.id}`)
                    .setLabel(cfg.button_label || 'Participer')
                    .setEmoji(cfg.button_emoji || '🎉')
                    .setStyle(ButtonStyle.Primary)
            );
            const sent = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
            await this.giveaway.setMessageId(g.id, sent.id);
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
        const g = await this.giveaway.end(id);
        if (!g) return interaction.reply({ content: '❌ Giveaway introuvable', ephemeral: true });
        const winners = (g.winners || []).map(id => `<@${id}>`).join(', ') || '_(aucun)_';
        return interaction.reply({ content: `🎉 Giveaway terminé. Gagnants : ${winners}` });
    }

    async executeGiveawayReroll(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const g = await this.giveaway.get(id);
        if (!g) return interaction.reply({ content: '❌ Giveaway introuvable', ephemeral: true });
        if (g.status !== 'ended') {
            return interaction.reply({ content: '❌ Le giveaway n\'est pas encore terminé', ephemeral: true });
        }
        const { winners, pool } = await this.giveaway.draw(id);
        if (winners.length === 0) {
            return interaction.reply({ content: '❌ Aucun participant à retirer', ephemeral: true });
        }
        await this.giveaway.repo.updateGiveaway(id, { winners, updatedAt: Date.now() });
        const winnersText = winners.map(w => `<@${w}>`).join(', ');
        return interaction.reply({ content: `🎉 Nouveau tirage : ${winnersText}` });
    }

    async executeGiveawayList(interaction) {
        const list = await this.giveaway.list({ guildId: interaction.guild.id, status: 'active', limit: 25 });
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
        const g = await this.giveaway.cancel(id);
        if (!g) return interaction.reply({ content: '❌ Giveaway introuvable', ephemeral: true });
        return interaction.reply({ content: '✅ Giveaway annulé' });
    }

    // =================== /poll-create ===================

    async executePollCreate(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const question = interaction.options.getString('question');
        const duration = interaction.options.getString('duration');
        const multiChoice = interaction.options.getBoolean('multi_choice') || false;
        const optsStr = interaction.options.getString('options');

        const options = optsStr.split('|').map(s => s.trim()).filter(Boolean);
        if (options.length < 2 || options.length > 10) {
            return interaction.reply({ content: '❌ 2 à 10 options attendues (séparées par |)', ephemeral: true });
        }
        const durationMs = duration === 'never' ? null : this._parseDuration(duration);
        if (duration !== 'never' && !durationMs) {
            return interaction.reply({ content: '❌ Durée invalide', ephemeral: true });
        }

        try {
            const p = await this.poll.create({
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                question,
                options,
                multiChoice,
                anonymous: false,
                durationMs,
                createdBy: interaction.user.id
            });
            const embed = await this.poll.buildEmbed(p);
            const row = new ActionRowBuilder();
            for (let i = 0; i < options.length; i++) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`poll:vote:${p.id}:${i}`)
                        .setLabel(`${i + 1}. ${options[i].slice(0, 30)}`)
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            const sent = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
            await this.poll.setMessageId(p.id, sent.id);
            return { id: p.id };
        } catch (err) {
            return interaction.editReply({ content: `❌ ${err.message}` });
        }
    }

    async executePollEnd(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const p = await this.poll.end(id);
        if (!p) return interaction.reply({ content: '❌ Sondage introuvable', ephemeral: true });
        const tally = await this.poll.tally(id);
        const lines = tally.perOption.map(o => `**${o.index + 1}.** ${o.label}: ${o.count}`);
        return interaction.reply({ content: `📊 Sondage terminé\n\n${lines.join('\n')}` });
    }

    async executePollList(interaction) {
        const list = await this.poll.list({ guildId: interaction.guild.id, status: 'active', limit: 25 });
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun sondage actif', ephemeral: true });
        }
        const lines = list.map(p => `• **${p.question}** — ${p.options.length} options${p.endsAt ? ` — finit <t:${Math.floor(p.endsAt / 1000)}:R>` : ''}`);
        return interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }

    async executePollDelete(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const p = await this.poll.get(id);
        if (!p) return interaction.reply({ content: '❌ Sondage introuvable', ephemeral: true });
        await this.poll.end(id);
        return interaction.reply({ content: '✅ Sondage fermé' });
    }

    _parseDuration(str) {
        if (!str) return null;
        const m = String(str).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase()];
        return n * mult;
    }
}

// =================== BUILDERS ===================

const giveawayStartBuilder = new SlashCommandBuilder()
    .setName('giveaway-start')
    .setDescription('Démarrer un giveaway')
    .addStringOption(o => o.setName('prize').setDescription('Lot à gagner').setRequired(true).setMaxLength(256))
    .addStringOption(o => o.setName('duration').setDescription('Durée (ex: 1h, 30m, 1d)').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Nombre de gagnants').setRequired(false).setMinValue(1).setMaxValue(20))
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

const giveawayListBuilder = new SlashCommandBuilder()
    .setName('giveaway-list')
    .setDescription('Lister les giveaways actifs');

const giveawayCancelBuilder = new SlashCommandBuilder()
    .setName('giveaway-cancel')
    .setDescription('Annuler un giveaway')
    .addStringOption(o => o.setName('id').setDescription('ID du giveaway').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const pollCreateBuilder = new SlashCommandBuilder()
    .setName('poll-create')
    .setDescription('Créer un sondage')
    .addStringOption(o => o.setName('question').setDescription('Question').setRequired(true).setMaxLength(256))
    .addStringOption(o => o.setName('options').setDescription('Options séparées par | (2-10)').setRequired(true).setMaxLength(500))
    .addStringOption(o => o.setName('duration').setDescription('Durée (ex: 1h, 1d) ou "never"').setRequired(true))
    .addBooleanOption(o => o.setName('multi_choice').setDescription('Choix multiple ?').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const pollEndBuilder = new SlashCommandBuilder()
    .setName('poll-end')
    .setDescription('Terminer un sondage manuellement')
    .addStringOption(o => o.setName('id').setDescription('ID du sondage').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const pollListBuilder = new SlashCommandBuilder()
    .setName('poll-list')
    .setDescription('Lister les sondages actifs');

const pollDeleteBuilder = new SlashCommandBuilder()
    .setName('poll-delete')
    .setDescription('Fermer un sondage')
    .addStringOption(o => o.setName('id').setDescription('ID du sondage').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

Command({ name: 'giveaway-start', builder: giveawayStartBuilder })(EngagementCommands.prototype, 'executeGiveawayStart');
Command({ name: 'giveaway-end', builder: giveawayEndBuilder })(EngagementCommands.prototype, 'executeGiveawayEnd');
Command({ name: 'giveaway-reroll', builder: giveawayRerollBuilder })(EngagementCommands.prototype, 'executeGiveawayReroll');
Command({ name: 'giveaway-list', builder: giveawayListBuilder })(EngagementCommands.prototype, 'executeGiveawayList');
Command({ name: 'giveaway-cancel', builder: giveawayCancelBuilder })(EngagementCommands.prototype, 'executeGiveawayCancel');
Command({ name: 'poll-create', builder: pollCreateBuilder })(EngagementCommands.prototype, 'executePollCreate');
Command({ name: 'poll-end', builder: pollEndBuilder })(EngagementCommands.prototype, 'executePollEnd');
Command({ name: 'poll-list', builder: pollListBuilder })(EngagementCommands.prototype, 'executePollList');
Command({ name: 'poll-delete', builder: pollDeleteBuilder })(EngagementCommands.prototype, 'executePollDelete');

module.exports = { EngagementCommands };
