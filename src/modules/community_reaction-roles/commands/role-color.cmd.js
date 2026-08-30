/**
 * src/modules/community_reaction-roles/commands/role-color.cmd.js
 *
 * Commande Slash pour modifier la couleur d'un rôle Discord (Phase 9 G25).
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');

function parseHexColor(input) {
    if (!input || typeof input !== 'string') return null;
    let clean = input.trim();
    if (clean.startsWith('#')) clean = clean.slice(1);

    // Si 3 caractères hex (#fff)
    if (clean.length === 3 && /^[0-9a-fA-F]{3}$/.test(clean)) {
        clean = clean.split('').map(c => c + c).join('');
    }

    if (clean.length === 6 && /^[0-9a-fA-F]{6}$/.test(clean)) {
        return `#${clean.toUpperCase()}`;
    }

    return null;
}

class RoleColorCommands {
    async executeRoleColor(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs avec la permission "Gérer les rôles" (ManageRoles).', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const colorInput = interaction.options.getString('couleur');

        const hex = parseHexColor(colorInput);
        if (!hex) {
            return interaction.reply({
                content: `❌ Code couleur invalide : "${colorInput}". Utilisez un format hexadécimal valide (ex: \`#FF0000\`, \`#5865F2\`, \`#2ECC71\`).`,
                ephemeral: true
            });
        }

        const botMember = interaction.guild.members.me;
        if (botMember && role.position >= botMember.roles.highest.position) {
            return interaction.reply({
                content: `❌ Le rôle **${role.name}** est placé plus haut ou au même niveau que mon rôle le plus élevé dans la hiérarchie Discord.`,
                ephemeral: true
            });
        }

        try {
            await role.setColor(hex, `Couleur modifiée par ${interaction.user.tag}`);

            const embed = new EmbedBuilder()
                .setColor(parseInt(hex.replace('#', ''), 16))
                .setTitle('🎨 Couleur du rôle mise à jour')
                .setDescription(`La couleur du rôle <@&${role.id}> a été changée pour **\`${hex}\`** avec succès !`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            return interaction.reply({
                content: `❌ Impossible de modifier la couleur du rôle : ${err.message}`,
                ephemeral: true
            });
        }
    }
}

const roleColorBuilder = new SlashCommandBuilder()
    .setName('role-color')
    .setDescription('Modifier la couleur d’un rôle')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(o => o.setName('role').setDescription('Le rôle à modifier').setRequired(true))
    .addStringOption(o => o.setName('couleur').setDescription('Code hexadécimal (ex: #5865F2 ou #FF0000)').setRequired(true));

Command({ name: 'role-color', builder: roleColorBuilder })(RoleColorCommands.prototype, 'executeRoleColor');

module.exports = { RoleColorCommands, parseHexColor };
