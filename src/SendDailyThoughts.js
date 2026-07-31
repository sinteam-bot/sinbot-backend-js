const path = require('path');

// ⭐ IMPORTANT : Remonter d'un niveau pour trouver .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

//require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const fs = require('fs');
const { buildPrompt, requestPrompt } = require('./config/daily_message_config');
const { callResponseCustom } = require('./utils/openrouter')
const { EmbedBuilder } = require('discord.js');


const { logUserEvent, getUserEvents, getGlobalStats } = require('./database');
const { loadCommands } = require('./utils/commandHandler');

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


const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = '1492194866451583059';

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
            "model": "gpt-5-nano"
        }

        var promptresponse = await callResponseCustom(dailyPrompt, promptoption);
        console.log('Test prompt : ' + promptresponse['text'])



        var DailyText = promptresponse['text'];
        var option = {
            "model": "gpt-5-nano",
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

