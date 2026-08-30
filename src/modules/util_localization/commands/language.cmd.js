/**
 * src/modules/util_localization/commands/language.cmd.js
 *
 * Commandes Slash /language (Phase 14 G34).
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { i18n } = require('../../../core/i18n.js');

class LanguageCommands {
    async executeSet(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageGuild).', ephemeral: true });
        }

        const lang = interaction.options.getString('langue');
        const updated = await i18n.setGuildLanguage(interaction.guild.id, lang);

        const msg = i18n.t('language.updated', updated, { lang: updated.toUpperCase() });
        return interaction.reply({ content: msg, ephemeral: true });
    }

    async executeGet(interaction) {
        const lang = await i18n.getGuildLanguage(interaction.guild.id);
        const msg = i18n.t('language.current', lang, { lang: lang.toUpperCase() });
        return interaction.reply({ content: msg, ephemeral: true });
    }

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'set': return this.executeSet(interaction);
            case 'get': return this.executeGet(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

const languageBuilder = new SlashCommandBuilder()
    .setName('language')
    .setDescription('Configurer ou afficher la langue du bot sur ce serveur')
    .addSubcommand(sub =>
        sub.setName('get')
            .setDescription('Afficher la langue configurée sur le serveur')
    )
    .addSubcommand(sub =>
        sub.setName('set')
            .setDescription('Définir la langue du serveur (admin)')
            .addStringOption(o =>
                o.setName('langue')
                    .setDescription('La langue choisie')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Français (FR)', value: 'fr' },
                        { name: 'English (EN)', value: 'en' },
                        { name: 'Español (ES)', value: 'es' }
                    )
            )
    );

Command({ name: 'language', builder: languageBuilder })(LanguageCommands.prototype, 'executeMain');

module.exports = { LanguageCommands };
