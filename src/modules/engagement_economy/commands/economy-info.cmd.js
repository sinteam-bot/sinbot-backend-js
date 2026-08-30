/**
 * src/modules/engagement_economy/commands/economy-info.cmd.js
 *
 * Commandes Slash pour /economy-info (G29) et /economy-boost (G11).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { EconomyService } = require('../services/economy.service.js');

class EconomyInfoCommands {
    static inject = [EconomyService];

    constructor(service) {
        this.service = service;
    }

    _parseDuration(str) {
        if (!str) return null;
        const m = str.trim().match(/^(\d+)\s*(m|min|h|hour|d|day|w|week)?$/i);
        if (!m) return null;
        const val = parseInt(m[1], 10);
        const unit = (m[2] || 'h').toLowerCase();
        switch (unit) {
            case 'm':
            case 'min': return val * 60;
            case 'h':
            case 'hour': return val * 3600;
            case 'd':
            case 'day': return val * 86400;
            case 'w':
            case 'week': return val * 604800;
            default: return val * 3600;
        }
    }

    async executeEconomyInfo(interaction) {
        const targetUser = interaction.options.getUser('membre') || interaction.user;
        const profile = await this.service.getEconomyProfile(interaction.guild.id, targetUser.id);

        let boostText = 'Aucun boost actif';
        if (profile.activeBoost) {
            const expSec = Math.floor(profile.activeBoost.expiresAt / 1000);
            const bonusPercent = Math.round((profile.activeBoost.multiplier - 1) * 100);
            boostText = `⚡ **+${bonusPercent}% (x${profile.activeBoost.multiplier})** — Expire <t:${expSec}:R>`;
        }

        const now = Date.now();
        const lastDaily = profile.lastDailyClaimAt ? `<t:${Math.floor(profile.lastDailyClaimAt / 1000)}:R>` : 'Jamais';
        const lastWork = profile.lastWorkClaimAt ? `<t:${Math.floor(profile.lastWorkClaimAt / 1000)}:R>` : 'Jamais';

        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle(`💰 Profil Économique • ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '💵 Portefeuille', value: `\`${profile.wallet.toLocaleString()}\` pièces`, inline: true },
                { name: '🏦 Banque', value: `\`${profile.bank.toLocaleString()}\` pièces`, inline: true },
                { name: '💎 Fortune Totale', value: `\`${profile.total.toLocaleString()}\` pièces`, inline: true },
                { name: '📈 Total Gagné', value: `\`${profile.totalEarned.toLocaleString()}\` pièces`, inline: true },
                { name: '📉 Total Dépensé', value: `\`${profile.totalSpent.toLocaleString()}\` pièces`, inline: true },
                { name: '🚀 Boost Actif', value: boostText, inline: false },
                { name: '🗓️ Dernier Daily', value: lastDaily, inline: true },
                { name: '🔨 Dernier Work', value: lastWork, inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    async executeEconomyBoost(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageGuild).', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('membre');
        const multiplier = interaction.options.getNumber('multiplicateur');
        const durationStr = interaction.options.getString('duree');

        const durationSeconds = this._parseDuration(durationStr);
        if (!durationSeconds || durationSeconds <= 0) {
            return interaction.reply({ content: `❌ Durée invalide ("${durationStr}"). Ex: \`1h\`, \`24h\`, \`3d\`.`, ephemeral: true });
        }

        if (multiplier < 1.01 || multiplier > 10.0) {
            return interaction.reply({ content: '❌ Le multiplicateur doit être compris entre 1.01 (+1%) et 10.0 (+900%).', ephemeral: true });
        }

        const res = await this.service.addBoost(interaction.guild.id, targetUser.id, multiplier, durationSeconds);
        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        const expSec = Math.floor(res.data.expiresAt / 1000);
        return interaction.reply({
            content: `✅ Boost de gains **x${multiplier}** (+${Math.round((multiplier - 1) * 100)}%) attribué à <@${targetUser.id}> jusqu'à <t:${expSec}:F> (<t:${expSec}:R>).`,
            ephemeral: true
        });
    }
}

const ecoInfoBuilder = new SlashCommandBuilder()
    .setName('economy-info')
    .setDescription('Afficher les détails de ton compte économique (solde, boost, cooldowns)')
    .addUserOption(o => o.setName('membre').setDescription('Le membre à consulter (optionnel)').setRequired(false));

const ecoBoostBuilder = new SlashCommandBuilder()
    .setName('economy-boost')
    .setDescription('Attribuer un multiplicateur de gains temporaire à un membre (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('membre').setDescription('Le membre à booster').setRequired(true))
    .addNumberOption(o => o.setName('multiplicateur').setDescription('Multiplicateur (ex: 1.5 pour +50%, 2.0 pour double)').setRequired(true))
    .addStringOption(o => o.setName('duree').setDescription('Durée (ex: 2h, 24h, 7d)').setRequired(true));

Command({ name: 'economy-info', builder: ecoInfoBuilder })(EconomyInfoCommands.prototype, 'executeEconomyInfo');
Command({ name: 'economy-boost', builder: ecoBoostBuilder })(EconomyInfoCommands.prototype, 'executeEconomyBoost');

module.exports = { EconomyInfoCommands };
