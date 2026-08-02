const { SlashCommandBuilder } = require('discord.js');
const { getMemberForGrognement } = require('../database')

module.exports = {
    // Définition de la Slash Command
    data: new SlashCommandBuilder()
        .setName('choose_member')
        .setDescription('Choisir un membre au pif')
    ,

    // Exécution de la commande préfixe !ping
    async execute(message, args) {
        return;
    },

    // Exécution de la Slash Command /ping
    async executeSlash(interaction) {
        try {

            const userId = await getMemberForGrognement();
            interaction.reply({
                content: `Le membre est <@${userId}>`
                //,ephemeral: true
            })
        } catch (error) {
            await interaction.reply({
                content: `❌ Erreur : ${error.message}`
            });
        }
    }
};