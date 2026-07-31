const path = require('path');

// ⭐ IMPORTANT : Remonter d'un niveau pour trouver .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

//require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

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
const CHANNEL_ID = '1348741823237062781';

// ============================================
// CONNEXION DU BOT
// ============================================
function addHours(date, hours) {
    const hoursToAdd = hours * 60 * 60 * 1000;
    date.setTime(date.getTime() + hoursToAdd);
    return date;
}


client.once('ready', async () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);

    try {
        // Récupérer le serveur (guild)
        const guild = await client.guilds.fetch(GUILD_ID);
        console.log(`Serveur trouvé: ${guild.name}`);

        // Récupérer le canal
        const channel = await guild.channels.fetch(CHANNEL_ID);
        console.log(`Canal trouvé: ${channel.name}`);
        var time = new Date();
        time2 = addHours(time, 2);
        const heureParis = time2.toLocaleTimeString('fr-FR', {
            timeZone: 'Europe/Paris',
            hour: '2-digit',
            minute: '2-digit'
        });
        channel.send(`## Prochain Bump à : ** ${heureParis} **`)


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

