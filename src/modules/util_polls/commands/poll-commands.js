/**
 * polls/commands/poll-commands.js
 *
 * Commandes slash pour les polls.
 *
 * Issue du split de game_engagement/ (Phase 9.2 du plan migrate-to-c12).
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { PollService } = require('../services/poll.service.js');

class PollCommands {
    static inject = [PollService];
    constructor(service) { this.service = service; }

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

Command({ name: 'poll-create', builder: pollCreateBuilder })(EngagementCommands.prototype, 'executePollCreate');
Command({ name: 'poll-end', builder: pollEndBuilder })(EngagementCommands.prototype, 'executePollEnd');
Command({ name: 'poll-list', builder: pollListBuilder })(EngagementCommands.prototype, 'executePollList');
Command({ name: 'poll-delete', builder: pollDeleteBuilder })(EngagementCommands.prototype, 'executePollDelete');

module.exports = { EngagementCommands };


Command({ name: 'poll-create', builder: pollCreateBuilder })(EngagementCommands.prototype, 'executePollCreate');
Command({ name: 'poll-end', builder: pollEndBuilder })(EngagementCommands.prototype, 'executePollEnd');
Command({ name: 'poll-list', builder: pollListBuilder })(EngagementCommands.prototype, 'executePollList');
Command({ name: 'poll-delete', builder: pollDeleteBuilder })(EngagementCommands.prototype, 'executePollDelete');
module.exports = { PollCommands };