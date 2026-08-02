const { SlashCommandBuilder } = require('discord.js');
const { addGrognement } = require('../database')

module.exports = {
    // Définition de la Slash Command
    data: new SlashCommandBuilder()
        .setName('confirm_member')
        .setDescription('Sauvegarder le membre')
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('Target user for grognement')
                .setRequired(true)
        )
    ,

    // Exécution de la commande préfixe !ping
    async execute(message, args) {
        return;
    },

    // Exécution de la Slash Command /ping
    async executeSlash(interaction) {
        try {

            const user = interaction.options.getUser('target');
            var result = await addGrognement({ 'id': user.id, 'name': user.displayName })
            interaction.reply({
                content: `Le membre <@${user.id}> a été sauvegardé à l’instant`,
                ephemeral: true
            })
        } catch (error) {
            await interaction.reply({
                content: `❌ Erreur : ${error.message}`
            });
        }
    }
};