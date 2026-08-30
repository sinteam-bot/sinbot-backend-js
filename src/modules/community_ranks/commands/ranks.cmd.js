/**
 * src/modules/community_ranks/commands/ranks.cmd.js
 *
 * Commandes Slash pour les rangs et rôles auto-rejoignables (Phase 10 G26).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { RanksService } = require('../services/ranks.service.js');

class RanksCommands {
    static inject = [RanksService];

    constructor(service) {
        this.service = service;
    }

    async executeJoin(interaction) {
        const name = interaction.options.getString('nom');
        const res = await this.service.joinRank(interaction.member, name);

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Tu as rejoint le rang **${res.rankName}** (rôle <@&${res.roleId}> ajouté).`,
            ephemeral: true
        });
    }

    async executeLeave(interaction) {
        const name = interaction.options.getString('nom');
        const res = await this.service.leaveRank(interaction.member, name);

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Tu as quitté le rang **${res.rankName}** (rôle <@&${res.roleId}> retiré).`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const ranks = await this.service.listRanks(interaction.guild.id);
        if (ranks.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun rang disponible sur ce serveur.', ephemeral: true });
        }

        const lines = ranks.map(r => {
            const desc = r.description ? ` — *${r.description}*` : '';
            return `• **${r.name}** (<@&${r.roleId}>)${desc}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🎖️ Rangs auto-rejoignables (${ranks.length})`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Utilisation : /rank join <nom> ou /rank leave <nom>' });

        return interaction.reply({ embeds: [embed] });
    }

    async executeAdd(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageRoles).', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const customName = interaction.options.getString('nom');
        const description = interaction.options.getString('description');
        const name = customName || role.name;

        const res = await this.service.createRank({
            guildId: interaction.guild.id,
            roleId: role.id,
            name,
            description
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `✅ Le rang **${res.data.name}** a été configuré pour le rôle <@&${role.id}>. Les membres peuvent le rejoindre avec \`/rank join ${res.data.name}\`.`,
            ephemeral: true
        });
    }

    async executeRemove(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageRoles).', ephemeral: true });
        }

        const name = interaction.options.getString('nom');
        const res = await this.service.deleteRank(interaction.guild.id, name);

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({ content: `✅ Le rang **${name}** a été supprimé.`, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'join':   return this.executeJoin(interaction);
            case 'leave':  return this.executeLeave(interaction);
            case 'list':   return this.executeList(interaction);
            case 'add':    return this.executeAdd(interaction);
            case 'remove': return this.executeRemove(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const ranksBuilder = new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Rejoindre, quitter ou consulter les rangs publics du serveur')
    .addSubcommand(sub =>
        sub.setName('join')
            .setDescription('Rejoindre un rang public')
            .addStringOption(o => o.setName('nom').setDescription('Nom du rang').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('leave')
            .setDescription('Quitter un rang public')
            .addStringOption(o => o.setName('nom').setDescription('Nom du rang').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister tous les rangs disponibles')
    )
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter un rôle aux rangs publics (admin)')
            .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true))
            .addStringOption(o => o.setName('nom').setDescription('Nom du rang (optionnel)').setRequired(false))
            .addStringOption(o => o.setName('description').setDescription('Description du rang').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Supprimer un rang public (admin)')
            .addStringOption(o => o.setName('nom').setDescription('Nom du rang').setRequired(true))
    );

Command({ name: 'rank', builder: ranksBuilder })(RanksCommands.prototype, 'executeMain');

module.exports = { RanksCommands };
