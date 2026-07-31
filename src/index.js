const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

// Charger les commandes
client.commands = loadCommands(client);

// ============================================
// CHARGEMENT DES ÉVÉNEMENTS
// ============================================

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

console.log('📂 Chargement des événements...');

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }

    console.log(`✅ Événement chargé: ${event.name}`);
}

console.log('');

// ============================================
// SERVEUR EXPRESS POUR WEBHOOKS (n8n)
// ============================================

const app = express();
app.use(express.json());

// Endpoint pour envoyer un message depuis n8n
app.post('/webhook/send-message', async (req, res) => {
    const { channelId, message, embed } = req.body;

    try {
        const channel = await client.channels.fetch(channelId);

        if (embed) {
            const { EmbedBuilder } = require('discord.js');
            const embedMessage = new EmbedBuilder()
                .setColor(embed.color || '#0099ff')
                .setTitle(embed.title || 'Message automatique')
                .setDescription(embed.description || message);

            await channel.send({ embeds: [embedMessage] });
        } else {
            await channel.send(message);
        }

        res.json({
            success: true,
            message: 'Message envoyé avec succès',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erreur webhook:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// Endpoint pour récupérer des statistiques
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getGlobalStats();
        res.json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint pour récupérer les événements d'un utilisateur
app.get('/api/user/:userId/events', async (req, res) => {
    try {
        const events = await getUserEvents(req.params.userId, 20);
        res.json({
            success: true,
            data: events,
            count: events.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        bot: client.user?.tag || 'non connecté',
        uptime: process.uptime(),
        commands: client.commands.size,
        timestamp: new Date().toISOString()
    });
});

// Démarrer le serveur Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║   🌐 SERVEUR WEBHOOK DÉMARRÉ !      ║');
    console.log('╚══════════════════════════════════════╝');
    console.log('');
    console.log(`✅ Serveur sur le port: ${PORT}`);
    console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook/send-message`);
    console.log(`📊 API Stats: http://localhost:${PORT}/api/stats`);
    console.log(`❤️  Health: http://localhost:${PORT}/health`);
    console.log('');
});

// ============================================
// GESTION DES ERREURS
// ============================================

process.on('unhandledRejection', error => {
    console.error('❌ Erreur non gérée:', error);
});

client.on('error', error => {
    console.error('❌ Erreur Discord.js:', error);
});

// ============================================
// CONNEXION DU BOT
// ============================================

console.log('🚀 Démarrage du bot...');
client.login(process.env.DISCORD_TOKEN);