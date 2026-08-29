/**
 * custom_commands/commands/customcmd-commands.js
 *
 * Commandes slash pour la feature custom_commands.
 *
 * Issue du split de game_engagement-advanced/ (Phase 9.2 du plan
 * migrate-to-c12). Avant : logique mélangée reminders+triggers+customcmd.
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { CustomCommandService } = require('../services/custom-command.service.js');

class CustomcommandsCommands {
    static inject = [CustomCommandService];
    constructor(service) { this.service = service; }

     executeCustomCmdAdd(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const name = interaction.options.getString('name').toLowerCase().replace(/^!+/, '');
        const responseText = interaction.options.getString('response');
        const r = await this.customs.create({
            guildId: interaction.guild.id,
            name,
            responseText,
            createdBy: interaction.user.id
        });
        if (!r.ok) {
            const messages = {
                already_exists: '❌ Une commande avec ce nom existe déjà',
                invalid_name: '❌ Nom de commande invalide (lettres, chiffres, tirets uniquement)',
                missing_params: '❌ Paramètres manquants'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Commande !${name} créée`, ephemeral: true });
        const list = await this.customs.list(interaction.guild.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucune commande personnalisée.', ephemeral: true });
        const lines = list.map(c => `• **!${c.name}** → *${c.responseText.slice(0, 50)}* (utilisée ${c.usesCount || 0} fois)`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('💬 Commandes personnalisées')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const name = interaction.options.getString('name').toLowerCase();
        const cmd = await this.customs.find(interaction.guild.id, name);
        if (!cmd) return interaction.reply({ content: `❌ Commande !${name} introuvable`, ephemeral: true });
        await this.customs.delete(cmd.id);
        return interaction.reply({ content: `✅ Commande !${name} supprimée`, ephemeral: true });
        if (!str) return null;
        const m = String(str).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase()];
        return n * mult;

     executeCustomCmdList(interaction) {
        const list = await this.customs.list(interaction.guild.id);
        if (list.length === 0) return interaction.reply({ content: 'ℹ️ Aucune commande personnalisée.', ephemeral: true });
        const lines = list.map(c => `• **!${c.name}** → *${c.responseText.slice(0, 50)}* (utilisée ${c.usesCount || 0} fois)`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('💬 Commandes personnalisées')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const name = interaction.options.getString('name').toLowerCase();
        const cmd = await this.customs.find(interaction.guild.id, name);
        if (!cmd) return interaction.reply({ content: `❌ Commande !${name} introuvable`, ephemeral: true });
        await this.customs.delete(cmd.id);
        return interaction.reply({ content: `✅ Commande !${name} supprimée`, ephemeral: true });
        if (!str) return null;
        const m = String(str).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase()];
        return n * mult;

     executeCustomCmdRemove(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux admins (ManageGuild)', ephemeral: true });
        }
        const name = interaction.options.getString('name').toLowerCase();
        const cmd = await this.customs.find(interaction.guild.id, name);
        if (!cmd) return interaction.reply({ content: `❌ Commande !${name} introuvable`, ephemeral: true });
        await this.customs.delete(cmd.id);
        return interaction.reply({ content: `✅ Commande !${name} supprimée`, ephemeral: true });
        if (!str) return null;
        const m = String(str).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase()];
        return n * mult;

}

const customCmdBuilder = new SlashCommandBuilder()
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

Command({ name: 'remind', builder: remindBuilder })(EngagementAdvancedCommands.prototype, 'executeRemindMain');
Command({ name: 'trigger', builder: triggerBuilder })(EngagementAdvancedCommands.prototype, 'executeTriggerMain');
Command({ name: 'customcmd', builder: customCmdBuilder })(EngagementAdvancedCommands.prototype, 'executeCustomCmdMain');

