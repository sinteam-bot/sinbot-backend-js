const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { callChatGPTWithHistory, calculateCost } = require('../utils/openrouter');
//const { logInfo, logError } = require('../database');

// Stocker les conversations en mémoire (par utilisateur)
const conversations = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Conversation avec ChatGPT')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Démarrer une nouvelle conversation')
                .addStringOption(option =>
                    option
                        .setName('premier_message')
                        .setDescription('Premier message (optionnel)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('message')
                .setDescription('Envoyer un message dans la conversation')
                .addStringOption(option =>
                    option
                        .setName('texte')
                        .setDescription('Votre message')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('Voir l\'historique de la conversation')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Effacer la conversation')
        ),

    async execute(message, args) {
        message.reply('❌ Cette commande est uniquement disponible en Slash Command. Utilisez `/chat`');
    },

    async executeSlash(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'start') {
            await this.startConversation(interaction);
        } else if (subcommand === 'message') {
            await this.sendMessage(interaction);
        } else if (subcommand === 'history') {
            await this.showHistory(interaction);
        } else if (subcommand === 'clear') {
            await this.clearConversation(interaction);
        }
    },

    async startConversation(interaction) {
        const userId = interaction.user.id;
        const firstMessage = interaction.options.getString('premier_message');

        // Initialiser la conversation
        conversations.set(userId, {
            history: [],
            totalTokens: 0,
            totalCost: 0,
            startedAt: new Date()
        });

        if (firstMessage) {
            await this.sendMessage(interaction, firstMessage);
        } else {
            await interaction.reply({
                content: '✅ Conversation démarrée ! Utilisez `/chat message` pour discuter.',
                ephemeral: true
            });
        }
    },

    async sendMessage(interaction, overrideMessage = null) {
        await interaction.deferReply();

        try {
            const userId = interaction.user.id;
            const message = overrideMessage || interaction.options.getString('texte');

            // Vérifier si conversation existe
            if (!conversations.has(userId)) {
                conversations.set(userId, {
                    history: [],
                    totalTokens: 0,
                    totalCost: 0,
                    startedAt: new Date()
                });
            }

            const conversation = conversations.get(userId);

            // Limiter l'historique à 10 messages max (pour éviter les coûts)
            if (conversation.history.length >= 20) {
                conversation.history = conversation.history.slice(-18);
            }

            // Appeler ChatGPT avec l'historique
            const response = await callChatGPTWithHistory(
                conversation.history,
                message,
                {
                    systemPrompt: 'Tu es un assistant amical sur Discord. Réponds de manière concise et claire.'
                }
            );

            // Calculer le coût
            const cost = calculateCost(
                response.model,
                response.usage.promptTokens,
                response.usage.completionTokens
            );

            // Mettre à jour la conversation
            conversation.history = response.updatedHistory;
            conversation.totalTokens += response.usage.totalTokens;
            conversation.totalCost += cost;

            // Logger
            /*await logInfo('chatgpt_conversation', 'Message dans conversation ChatGPT', {
                userId: interaction.user.id,
                username: interaction.user.username,
                source: 'chat_command',
                details: {
                    messageLength: message.length,
                    historyLength: conversation.history.length,
                    tokens: response.usage.totalTokens,
                    cost: cost.toFixed(6)
                }
            });*/

            // Créer l'embed
            const embed = new EmbedBuilder()
                .setColor('#10a37f')
                .setAuthor({
                    name: 'ChatGPT',
                    iconURL: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg'
                })
                .setDescription(response.text)
                .setFooter({
                    text: `💬 ${conversation.history.length / 2} messages • ${conversation.totalTokens} tokens • ~$${conversation.totalCost.toFixed(6)}`
                })
                .setTimestamp();

            // Boutons
            /*const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('chat_continue')
                        .setLabel('💬 Continuer')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('chat_history')
                        .setLabel('📜 Historique')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('chat_clear')
                        .setLabel('🗑️ Effacer')
                        .setStyle(ButtonStyle.Danger)
                );
            
            await interaction.editReply({ 
                embeds: [embed],
                components: [row]
            });*/

        } catch (error) {
            console.error('❌ Erreur chat:', error);
            await interaction.editReply({
                content: `❌ Erreur : ${error.message}`
            });
        }
    },

    async showHistory(interaction) {
        const userId = interaction.user.id;

        if (!conversations.has(userId)) {
            await interaction.reply({
                content: '❌ Aucune conversation en cours. Utilisez `/chat start`',
                ephemeral: true
            });
            return;
        }

        const conversation = conversations.get(userId);

        const historyEmbed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📜 Historique de Conversation')
            .setDescription(`${conversation.history.length} message(s)`)
            .setTimestamp();

        conversation.history.forEach((msg, index) => {
            const role = msg.role === 'user' ? '👤 Vous' : '🤖 ChatGPT';
            const content = msg.content.substring(0, 200);

            historyEmbed.addFields({
                name: `${index + 1}. ${role}`,
                value: content + (msg.content.length > 200 ? '...' : ''),
                inline: false
            });
        });

        historyEmbed.setFooter({
            text: `Total: ${conversation.totalTokens} tokens • ~$${conversation.totalCost.toFixed(6)}`
        });

        await interaction.reply({
            embeds: [historyEmbed],
            ephemeral: true
        });
    },

    async clearConversation(interaction) {
        const userId = interaction.user.id;

        if (conversations.has(userId)) {
            conversations.delete(userId);
            await interaction.reply({
                content: '✅ Conversation effacée !',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '❌ Aucune conversation en cours.',
                ephemeral: true
            });
        }
    }
};