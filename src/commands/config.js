const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const { callChatGPT, calculateCost, estimateTokens } = require('../utils/openrouter');
const { getHumour, getEcriture, getNarratif, getContrainte } = require('../config/daily_message_config');

//const { logInfo, logError } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configuration du Bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('dailymessage')
                .setDescription('Configure la pensée du jour')
                .addStringOption(option =>
                    option
                        .setName('parametre')
                        .setDescription('Parametre possibles')
                        .addChoices(
                            { name: 'ANGLE_HUMOUR', value: 'humour' },
                            { name: 'STYLE_ECRITURE', value: 'ecriture' },
                            { name: 'DISPOSITIF_NARRATIF', value: 'narratif' },
                            { name: 'CONTRAINTE_LEGERE', value: 'contrainte' }
                        )
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName('action')
                        .setDescription('Modifier les valeurs?')
                        .setRequired(true)
                ),
        ),

    async execute(message, args) {
        message.reply('❌ Cette commande est uniquement disponible en Slash Command. Utilisez `/ask`');
    },

    async executeSlash(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (interaction.channel.id != '1348741823237062781') {
            await interaction.reply({
                content: `❌ Erreur : Vous n'avez pas accès à cette commande.`,
                ephemeral: true
            });
            return '';
        }

        if (subcommand === 'dailymessage') {
            try {
                const parametre = interaction.options.getString('parametre');
                const modif = interaction.options.getBoolean('action');
                var retour;
                switch (parametre) {
                    case "humour":
                        retour = getHumour();
                        break;
                    case "ecriture":
                        retour = getEcriture();
                        break;
                    case "narratif":
                        retour = getNarratif();
                        break;
                    case "contrainte":
                        retour = getContrainte();
                        break;
                }
                var channel = interaction.channel;
                const embed = new EmbedBuilder()
                    .setColor('#F2C7CE')
                    .setTitle(`** Paramètres ${parametre}**`)
                    .setDescription(retour)
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });

            } catch (error) {
                console.error('❌ Erreur ask:', error);
                await interaction.editReply({
                    content: `❌ Erreur : ${error.message}`,
                    ephemeral: true
                });

            }

        }
    }
};