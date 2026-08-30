/**
 * src/modules/community_timed_roles/commands/timed-roles.cmd.js
 *
 * Commandes Slash pour les rôles temporaires (Phase 10 G07).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { TimedRolesService } = require('../services/timed-roles.service.js');

class TimedRolesCommands {
    static inject = [TimedRolesService];

    constructor(service) {
        this.service = service;
    }

    async executeAdd(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageRoles).', ephemeral: true });
        }

        const member = interaction.options.getMember('membre');
        const role = interaction.options.getRole('role');
        const durationStr = interaction.options.getString('duree');

        const durationSeconds = this.service.parseDuration(durationStr);
        if (!durationSeconds || durationSeconds <= 0) {
            return interaction.reply({
                content: `❌ Durée invalide : "${durationStr}". Exemples valides : \`30m\`, \`2h\`, \`7d\`, \`1w\`.`,
                ephemeral: true
            });
        }

        const botMember = interaction.guild.members.me;
        if (botMember && role.position >= botMember.roles.highest.position) {
            return interaction.reply({
                content: `❌ Impossible d'attribuer ce rôle : sa position dans la hiérarchie est égale ou supérieure à mon rôle.`,
                ephemeral: true
            });
        }

        const res = await this.service.addTimedRole(member, role.id, durationSeconds);
        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        const expiresSec = Math.floor(res.data.expiresAt / 1000);
        return interaction.reply({
            content: `✅ Le rôle <@&${role.id}> a été attribué à <@${member.id}> jusqu'à <t:${expiresSec}:F> (<t:${expiresSec}:R>).`,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const member = interaction.options.getMember('membre');
        let list;

        if (member) {
            list = await this.service.listUserTimedRoles(interaction.guild.id, member.id);
        } else {
            list = await this.service.listGuildTimedRoles(interaction.guild.id);
        }

        if (!list || list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun rôle temporaire actif.', ephemeral: true });
        }

        const lines = list.map(item => {
            const expSec = Math.floor(item.expiresAt / 1000);
            return `• <@${item.userId}> : <@&${item.roleId}> — Expire <t:${expSec}:R>`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏳ Rôles temporaires actifs')
            .setDescription(lines.slice(0, 30).join('\n'))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    async executeRemove(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageRoles).', ephemeral: true });
        }

        const member = interaction.options.getMember('membre');
        const role = interaction.options.getRole('role');

        await this.service.removeTimedRole(interaction.guild.id, member.id, role.id, member);

        return interaction.reply({
            content: `✅ Le rôle temporaire <@&${role.id}> a été retiré de <@${member.id}>.`,
            ephemeral: true
        });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeAdd(interaction);
            case 'list':   return this.executeList(interaction);
            case 'remove': return this.executeRemove(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const timedRoleBuilder = new SlashCommandBuilder()
    .setName('timed-role')
    .setDescription('Gestion des rôles temporaires avec expiration automatique')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Attribuer un rôle temporaire à un membre')
            .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Le rôle à donner').setRequired(true))
            .addStringOption(o => o.setName('duree').setDescription('Durée (ex: 30m, 2h, 7d, 1w)').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les rôles temporaires actifs')
            .addUserOption(o => o.setName('membre').setDescription('Filtrer par membre (optionnel)').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Retirer un rôle temporaire')
            .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true))
    );

Command({ name: 'timed-role', builder: timedRoleBuilder })(TimedRolesCommands.prototype, 'executeMain');

module.exports = { TimedRolesCommands };
