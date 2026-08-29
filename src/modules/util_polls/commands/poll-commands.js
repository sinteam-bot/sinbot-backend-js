/**
 * polls/commands/poll-commands.js
 *
 * Commandes slash pour les polls.
 *
 * Issue du split de game_engagement/ (Phase 9.2 du plan migrate-to-c12).
 */

const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { PollService } = require('../services/poll.service.js');

function requireMod(interaction) {
    const member = interaction.member;
    if (!member) return false;
    return member.permissions?.has?.(PermissionFlagsBits.ManageMessages) || false;
}

class PollCommands {
    static inject = [PollService];
    constructor(service) { this.service = service; }

    async executePollCreate(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const question = interaction.options.getString('question');
        const optionsStr = interaction.options.getString('options');
        const duration = interaction.options.getString('duration');
        const multiChoice = interaction.options.getBoolean('multi_choice') || false;

        const options = optionsStr.split('|').map(s => s.trim()).filter(Boolean);
        if (options.length < 2 || options.length > 10) {
            return interaction.reply({ content: '❌ Il faut entre 2 et 10 options', ephemeral: true });
        }

        const endsAt = duration === 'never' ? null : this._parseDuration(duration);
        if (duration !== 'never' && !endsAt) {
            return interaction.reply({ content: '❌ Durée invalide (ex: 1h, 1d, never)', ephemeral: true });
        }

        try {
            const p = await this.service.create({
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                question,
                options,
                multiChoice,
                endsAt,
                createdBy: interaction.user.id
            });
            const embed = this.service.buildEmbed(p);
            const row = new ActionRowBuilder().addComponents(
                options.map((opt, i) => new ButtonBuilder()
                    .setCustomId(`poll:vote:${p.id}:${i}`)
                    .setLabel(opt)
                    .setStyle(ButtonStyle.Primary))
            );
            const sent = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
            await this.service.setMessageId(p.id, sent.id);
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
        const p = await this.service.end(id);
        if (!p) return interaction.reply({ content: '❌ Sondage introuvable', ephemeral: true });
        return interaction.reply({ content: '✅ Sondage fermé' });
    }

    async executePollList(interaction) {
        const list = await this.service.list({ guildId: interaction.guild.id, status: 'active', limit: 25 });
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun sondage actif', ephemeral: true });
        }
        const lines = list.map(p => `• **${p.question}** — ${(p.options || []).length} options`);
        return interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }

    async executePollDelete(interaction) {
        if (!requireMod(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const p = await this.service.get(id);
        if (!p) return interaction.reply({ content: '❌ Sondage introuvable', ephemeral: true });
        await this.service.end(id);
        return interaction.reply({ content: '✅ Sondage fermé' });
    }

    _parseDuration(str) {
        const m = String(str || '').match(/^(\d+)\s*([smhd])$/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
        return Date.now() + n * mult;
    }
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

Command({ name: 'poll-create', builder: pollCreateBuilder })(PollCommands.prototype, 'executePollCreate');
Command({ name: 'poll-end', builder: pollEndBuilder })(PollCommands.prototype, 'executePollEnd');
Command({ name: 'poll-list', builder: pollListBuilder })(PollCommands.prototype, 'executePollList');
Command({ name: 'poll-delete', builder: pollDeleteBuilder })(PollCommands.prototype, 'executePollDelete');

module.exports = { PollCommands };
