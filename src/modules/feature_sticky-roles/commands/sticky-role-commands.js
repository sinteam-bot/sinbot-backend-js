/**
 * /stickyrole add|remove|list|clear
 *
 * - /stickyrole-add  role:@role    : ajoute ce rôle à ma liste sticky
 * - /stickyrole-remove role:@role : retire ce rôle de ma liste
 * - /stickyrole-list               : liste mes rôles sticky
 * - /stickyrole-clear              : vide ma liste
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { StickyRolesService } = require('../services/sticky-roles.service.js');

class StickyRoleCommands {
    static inject = [StickyRolesService];

    constructor(service) {
        this.service = service;
    }

    async executeAdd(interaction) {
        const role = interaction.options.getRole('role');
        const cfg = getConfig().features?.['sticky-roles'] || {};
        const r = await this.service.addRole(interaction.guild.id, interaction.user.id, role.id, cfg);
        if (!r.ok) {
            return interaction.reply({ content: r.error === 'max_per_user_reached' ? `❌ Tu as déjà ${cfg.max_per_user || 10} rôles sticky` : `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ **${role.name}** sera ré-attribué automatiquement à ton retour.`, ephemeral: true });
    }

    async executeRemove(interaction) {
        const role = interaction.options.getRole('role');
        await this.service.removeRole(interaction.guild.id, interaction.user.id, role.id);
        return interaction.reply({ content: `✅ **${role.name}** retiré de tes rôles sticky.`, ephemeral: true });
    }

    async executeList(interaction) {
        const list = await this.service.listForUser(interaction.guild.id, interaction.user.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Tu n\'as aucun rôle sticky. Utilise `/stickyrole-add`.', ephemeral: true });
        }
        const lines = list.map(e => `<@&${e.roleId}>`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎭 Tes rôles sticky')
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Ces rôles te seront ré-attribués à ton retour.' });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeClear(interaction) {
        await this.service.clearForUser(interaction.guild.id, interaction.user.id);
        return interaction.reply({ content: '✅ Tous tes rôles sticky ont été retirés.', ephemeral: true });
    }
}

const addBuilder = new SlashCommandBuilder()
    .setName('stickyrole-add')
    .setDescription('Marquer un rôle comme sticky (ré-attribué à ton retour)')
    .addRoleOption(o => o.setName('role').setDescription('Rôle à marquer comme sticky').setRequired(true));

const removeBuilder = new SlashCommandBuilder()
    .setName('stickyrole-remove')
    .setDescription('Retirer un rôle de ta liste sticky')
    .addRoleOption(o => o.setName('role').setDescription('Rôle à retirer').setRequired(true));

const listBuilder = new SlashCommandBuilder()
    .setName('stickyrole-list')
    .setDescription('Voir tes rôles sticky');

const clearBuilder = new SlashCommandBuilder()
    .setName('stickyrole-clear')
    .setDescription('Vider ta liste de rôles sticky');

Command({ name: 'stickyrole-add', builder: addBuilder })(StickyRoleCommands.prototype, 'executeAdd');
Command({ name: 'stickyrole-remove', builder: removeBuilder })(StickyRoleCommands.prototype, 'executeRemove');
Command({ name: 'stickyrole-list', builder: listBuilder })(StickyRoleCommands.prototype, 'executeList');
Command({ name: 'stickyrole-clear', builder: clearBuilder })(StickyRoleCommands.prototype, 'executeClear');

module.exports = { StickyRoleCommands };
