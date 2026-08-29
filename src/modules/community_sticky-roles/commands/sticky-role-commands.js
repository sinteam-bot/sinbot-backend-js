/**
 * /stickyrole add|remove|list|clear
 *
 * Commandes regroupées sous /stickyrole :
 *   /stickyrole add    : ajouter un rôle sticky
 *   /stickyrole remove : retirer un rôle sticky
 *   /stickyrole list   : lister ses rôles sticky
 *   /stickyrole clear  : vider sa liste de rôles sticky
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { StickyRolesService } = require('../services/sticky-roles.service.js');

class StickyRoleCommands {
    static inject = [StickyRolesService];

    static __commandBuilder = new SlashCommandBuilder()
        .setName('stickyrole')
        .setDescription('Gestion des rôles conservés automatiquement lors du départ/retour')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Marquer un rôle comme sticky (ré-attribué à ton retour)')
                .addRoleOption(o => o.setName('role').setDescription('Rôle à marquer comme sticky').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Retirer un rôle de ta liste sticky')
                .addRoleOption(o => o.setName('role').setDescription('Rôle à retirer').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Voir tes rôles sticky')
        )
        .addSubcommand(sub =>
            sub.setName('clear')
                .setDescription('Vider ta liste de rôles sticky')
        );

    constructor(service) {
        this.service = service;
    }

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeAdd(interaction);
            case 'remove': return this.executeRemove(interaction);
            case 'list':   return this.executeList(interaction);
            case 'clear':  return this.executeClear(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
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
            return interaction.reply({ content: 'ℹ️ Tu n\'as aucun rôle sticky. Utilise `/stickyrole add`.', ephemeral: true });
        }
        const lines = list.map(e => `<@&${e.roleId}>`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎭 Tes rôles sticky')
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Ces rôles te seront ré-attribué à ton retour.' });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeClear(interaction) {
        await this.service.clearForUser(interaction.guild.id, interaction.user.id);
        return interaction.reply({ content: '✅ Tous tes rôles sticky ont été retirés.', ephemeral: true });
    }
}

Command({ name: 'stickyrole', description: 'Gestion des rôles sticky' })(StickyRoleCommands.prototype, 'execute');

module.exports = { StickyRoleCommands };
