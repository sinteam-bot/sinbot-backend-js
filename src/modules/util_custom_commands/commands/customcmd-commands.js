/**
 * custom_commands/commands/customcmd-commands.js
 *
 * Commandes slash pour la feature custom_commands.
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { CustomCommandService } = require('../services/custom-command.service.js');

function isAdmin(interaction) {
    return interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) || false;
}

class CustomCommandsCommands {
    static inject = [CustomCommandService];
    constructor(service) { this.service = service; }

    async executeCustomcmdAdd(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const name = interaction.options.getString('name');
        const responseText = interaction.options.getString('response');
        const r = await this.service.create({
            guildId: interaction.guild.id,
            name,
            responseText,
            createdBy: interaction.user.id
        });
        if (!r.ok) {
            return interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Commande personnalisée créée : !${name}`, ephemeral: true });
    }

    async executeCustomcmdList(interaction) {
        const list = await this.service.list(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucune commande personnalisée', ephemeral: true });
        }
        const lines = list.map(c => `• \`!${c.name}\` → ${c.responseText?.slice(0, 50) || '_(embed)_'}`);
        return interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }

    async executeCustomcmdRemove(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const name = interaction.options.getString('name');
        const cmd = await this.service.find(interaction.guild.id, name);
        if (!cmd) {
            return interaction.reply({ content: '❌ Commande introuvable', ephemeral: true });
        }
        await this.service.delete(cmd.id);
        return interaction.reply({ content: '✅ Commande supprimée', ephemeral: true });
    }

    async executeCustomcmdMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':    return this.executeCustomcmdAdd(interaction);
            case 'list':   return this.executeCustomcmdList(interaction);
            case 'remove': return this.executeCustomcmdRemove(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const customcmdBuilder = new SlashCommandBuilder()
    .setName('customcmd')
    .setDescription('Gestion des commandes personnalisées avec préfixe !')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter une commande personnalisée (admin)')
            .addStringOption(o => o.setName('name').setDescription('Nom de la commande (sans préfixe !)').setRequired(true).setMaxLength(32))
            .addStringOption(o => o.setName('response').setDescription('Réponse du bot').setRequired(true).setMaxLength(500))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Voir les commandes personnalisées')
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Supprimer une commande personnalisée (admin)')
            .addStringOption(o => o.setName('name').setDescription('Nom de la commande').setRequired(true).setMaxLength(32))
    );

Command({ name: 'customcmd', builder: customcmdBuilder })(CustomCommandsCommands.prototype, 'executeCustomcmdMain');

module.exports = { CustomCommandsCommands };
