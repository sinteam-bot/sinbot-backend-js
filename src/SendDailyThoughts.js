const path = require('path');
const { config } = require('./config/index.js');
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const { buildPrompt, requestPrompt } = require("./modules/feature_daily-message/daily-message.config.js");
const { callResponseCustom } = require("./utils/openrouter.js");

const { logUserEvent, getUserEvents, getGlobalStats } = require("./database.js");
const { loadCommands } = require("./utils/commandHandler.js");

// ============================================
// CONFIGURATION DU CLIENT DISCORD
// ============================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const BOT_TOKEN = config.discord?.token || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
const GUILD_ID = config.discord?.guild_id || process.env.GUILD_ID;
const CHANNEL_ID = config.daily_message?.channel_id || '1492194866451583059';

// Modèle par défaut pour OpenRouter
const DEFAULT_MODEL = config.daily_message?.ai_config?.model || config.openrouter?.default_model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

// ============================================
// CONNEXION DU BOT
// ============================================

client.once('ready', async () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);

    try {
        // Récupérer le serveur (guild)
        const guild = await client.guilds.fetch(GUILD_ID);
        console.log(`Serveur trouvé: ${guild.name}`);

        // Récupérer le canal
        const channel = await guild.channels.fetch(CHANNEL_ID);
        console.log(`Canal trouvé: ${channel.name}`);

        // Envoyer le message
        var dailyPrompt = requestPrompt();
        var promptoption = {
            "model": DEFAULT_MODEL
        }

        var promptresponse = await callResponseCustom(dailyPrompt, promptoption);
        console.log('Test prompt : ' + promptresponse['text'])



        var DailyText = promptresponse['text'];
        var option = {
            "model": DEFAULT_MODEL,
            //"systemPrompt":DailyText['instruction']
        }

        var response = await callResponseCustom(DailyText['prompt'], option);

        if (channel) {
            const embed = new EmbedBuilder()
                .setColor('#F2C7CE')
                .setTitle('** Le message du jour **')
                .setDescription(response['text'])
                //.setDescription('Meuhhhh')
                .setTimestamp();

            channel.send({ embeds: [embed] });
        }

        // Déconnecter le bot après l'envoi
        setTimeout(() => {
            console.log('Déconnexion du bot...');
            client.destroy();
            process.exit(0);
        }, 1000);

    } catch (error) {
        console.error('Erreur:', error);
        client.destroy();
        process.exit(1);
    }
});

// Gestion des erreurs
client.on('error', error => {
    console.error('Erreur du client Discord:', error);
});



//console.log('🚀 Démarrage du bot...');
client.login(process.env.DISCORD_TOKEN);

