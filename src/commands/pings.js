const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    // Définition de la Slash Command
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Vérifier la latence du bot'),
    
    // Exécution de la commande préfixe !ping
    async execute(message, args) {
        const sent = await message.reply('🏓 Pong!');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        sent.edit(`🏓 Pong! Latence: ${latency}ms | API: ${Math.round(message.client.ws.ping)}ms`);
    },
    
    // Exécution de la Slash Command /ping
    async executeSlash(interaction) {
        const sent = await interaction.reply({ content: '🏓 Pong!', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`🏓 Pong! Latence: ${latency}ms | API: ${Math.round(interaction.client.ws.ping)}ms`);
    }
};