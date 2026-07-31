const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { callChatGPT, calculateCost, estimateTokens } = require('../utils/openai');
//const { logInfo, logError } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Poser une question à ChatGPT')
        .addStringOption(option =>
            option
                .setName('question')
                .setDescription('Votre question')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('mode')
                .setDescription('Mode de réponse')
                .addChoices(
                    { name: '💬 Normal', value: 'normal' },
                    { name: '🎓 Expert', value: 'expert' },
                    { name: '😄 Amusant', value: 'fun' },
                    { name: '👶 Simple', value: 'simple' }
                )
                .setRequired(false)
        ),
    
    async execute(message, args) {
        message.reply('❌ Cette commande est uniquement disponible en Slash Command. Utilisez `/ask`');
    },
    
    async executeSlash(interaction) {
        await interaction.deferReply();
        
        try {
            const question = interaction.options.getString('question');
            const mode = interaction.options.getString('mode') || 'normal';
            
            // System prompts selon le mode
            const systemPrompts = {
                normal: 'Tu es un assistant utile et amical.',
                expert: 'Tu es un expert technique qui donne des réponses détaillées et précises avec des exemples.',
                fun: 'Tu es un assistant drôle et créatif qui répond avec humour tout en restant utile.',
                simple: 'Tu es un assistant qui explique les choses de manière très simple, comme à un enfant de 10 ans.'
            };
            
            console.log(`🤖 Question de ${interaction.user.username}: ${question.substring(0, 50)}...`);
            
            // Appeler ChatGPT
            const response = await callChatGPT(question, {
                systemPrompt: systemPrompts[mode]
            });
            
            // Calculer le coût
            const cost = calculateCost(
                response.model,
                response.usage.promptTokens,
                response.usage.completionTokens
            );
            
            // Logger l'utilisation
            /*await logInfo('chatgpt_query', `Question posée à ChatGPT`, {
                userId: interaction.user.id,
                username: interaction.user.username,
                source: 'ask_command',
                details: {
                    question: question.substring(0, 100),
                    mode: mode,
                    model: response.model,
                    tokens: response.usage.totalTokens,
                    cost: cost.toFixed(6)
                }
            });*/
            
            // Créer l'embed de réponse
            const embed = new EmbedBuilder()
                .setColor('#10a37f')
                .setAuthor({
                    name: 'ChatGPT',
                    iconURL: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg'
                })
                .setTitle('💬 Réponse')
                .setDescription(response.text)
                .addFields(
                    { name: '❓ Question', value: question.substring(0, 1024), inline: false }
                )
                .setFooter({ 
                    text: `${response.model} • ${response.usage.totalTokens} tokens • ~$${cost.toFixed(6)}` 
                })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('❌ Erreur ask:', error);
            
            /*await logError('chatgpt_error', error.message, {
                userId: interaction.user.id,
                source: 'ask_command',
                errorStack: error.stack
            });*/
            
            await interaction.editReply({
                content: `❌ Erreur : ${error.message}`,
                ephemeral: true
            });
        }
    }
};