/**
 * src/modules/util_timers/commands/timer.cmd.js
 *
 * Commandes Slash /timer (Phase 14 G24).
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { TimersService } = require('../services/timers.service.js');

class TimerCommands {
    static inject = [TimersService];

    constructor(service) {
        this.service = service;
    }

    _parseDuration(str) {
        if (!str) return null;
        const m = str.trim().match(/^(\d+)\s*(s|sec|m|min|h|hour|d|day)?$/i);
        if (!m) return null;
        const val = parseInt(m[1], 10);
        const unit = (m[2] || 'm').toLowerCase();
        switch (unit) {
            case 's':
            case 'sec': return val;
            case 'm':
            case 'min': return val * 60;
            case 'h':
            case 'hour': return val * 3600;
            case 'd':
            case 'day': return val * 86400;
            default: return val * 60;
        }
    }

    async executeCreate(interaction) {
        const durationStr = interaction.options.getString('duree');
        const label = interaction.options.getString('label') || 'Minuterie';

        const durationSec = this._parseDuration(durationStr);
        if (!durationSec || durationSec <= 0) {
            return interaction.reply({ content: `❌ Format de durée invalide ("${durationStr}"). Exemples : \`30s\`, \`10m\`, \`2h\`.`, ephemeral: true });
        }

        const res = await this.service.createTimer({
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            userId: interaction.user.id,
            label,
            durationSeconds: durationSec
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        const expSec = Math.floor(res.data.endsAt / 1000);
        return interaction.reply({
            content: `⏳ Minuterie **"${label}"** lancée ! Tu seras ping ici à <t:${expSec}:T> (<t:${expSec}:R>).`,
            ephemeral: false
        });
    }

    async executeList(interaction) {
        const list = await this.service.listTimers(interaction.guild.id, interaction.user.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Tu n\'as aucune minuterie active sur ce serveur.', ephemeral: true });
        }

        const lines = list.map(t => {
            const expSec = Math.floor(t.endsAt / 1000);
            return `• \`${t.id}\` — **${t.label}** : se termine <t:${expSec}:R> dans <#${t.channelId}>`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle(`⏰ Tes minuteries actives (${list.length})`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Utilise /timer cancel <id> pour annuler' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeCancel(interaction) {
        const id = interaction.options.getString('id');
        await this.service.cancelTimer(id, interaction.user.id);

        return interaction.reply({ content: `✅ Minuterie \`${id}\` annulée.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'create': return this.executeCreate(interaction);
            case 'list':   return this.executeList(interaction);
            case 'cancel': return this.executeCancel(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const timerBuilder = new SlashCommandBuilder()
    .setName('timer')
    .setDescription('Minuteries et rappels rapides avec ping dans le salon')
    .addSubcommand(sub =>
        sub.setName('create')
            .setDescription('Lancer une nouvelle minuterie')
            .addStringOption(o => o.setName('duree').setDescription('Durée (ex: 30s, 5m, 1h)').setRequired(true))
            .addStringOption(o => o.setName('label').setDescription('Description ou rappel (optionnel)').setRequired(false).setMaxLength(100))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister tes minuteries actives')
    )
    .addSubcommand(sub =>
        sub.setName('cancel')
            .setDescription('Annuler une minuterie active')
            .addStringOption(o => o.setName('id').setDescription('ID de la minuterie').setRequired(true))
    );

Command({ name: 'timer', builder: timerBuilder })(TimerCommands.prototype, 'executeMain');

module.exports = { TimerCommands };
