const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { config } = require('./config/index.js');

const { logUserEvent, getUserEvents, getGlobalStats } = require("./database.js");
const { loadCommands } = require("./utils/commandHandler.js");
const logger = require("./utils/logger.js");
const createWebRouter = require("./web/webRouter.js");
const { initDiscordEventTracker } = require("./utils/discordEventTracker.js");

// Activer la capture des logs console pour le salon virtuel Logs
logger.initConsoleInterceptor();

// ============================================
// CONFIGURATION DU CLIENT DISCORD
// ============================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution
    ]
});

// Charger les commandes
client.commands = loadCommands(client);

// Initialiser le suivi et l'archivage universel de tous les événements Discord
initDiscordEventTracker(client);

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

// Middleware de protection et d'authentification Web / API
const webAuthMiddleware = (req, res, next) => {
    const authConfig = config.web?.auth || {};

    // 1. Si la protection est désactivée, passer immédiatement
    if (!authConfig.enabled) {
        return next();
    }

    // 2. Endpoints toujours publics : health check et vérification d'authentification
    if (req.path === '/health' || req.path === '/api/auth/status' || req.path === '/api/auth/verify') {
        return next();
    }

    // 3. Vérification de la liste blanche d'adresses IP si configurée
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    if (authConfig.allowed_ips && Array.isArray(authConfig.allowed_ips) && authConfig.allowed_ips.length > 0) {
        if (authConfig.allowed_ips.includes(clientIp) || clientIp === '127.0.0.1' || clientIp === '::1') {
            return next();
        }
    }

    // 4. Extraction du token / clé d'API
    let providedKey = req.headers['x-api-key'] || req.query.api_key || req.query.token;

    if (!providedKey && req.headers['authorization']) {
        const authHeader = req.headers['authorization'];
        if (authHeader.startsWith('Bearer ')) {
            providedKey = authHeader.substring(7).trim();
        } else if (authHeader.startsWith('Basic ')) {
            try {
                const decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
                providedKey = decoded.includes(':') ? decoded.split(':')[1] : decoded;
            } catch {
                providedKey = authHeader;
            }
        } else {
            providedKey = authHeader;
        }
    }

    const expectedKey = authConfig.api_key;

    if (providedKey && expectedKey && providedKey === expectedKey) {
        return next();
    }

    // 5. Refus d'accès si non autorisé
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
        return res.status(401).json({
            success: false,
            error: 'Accès non autorisé : Clé API manquante ou invalide.'
        });
    }

    if (authConfig.protect_static) {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><title>401 - Accès Protégé</title></head>
            <body style="font-family:sans-serif;text-align:center;padding:50px;background:#1e1f22;color:#fff;">
                <h2>🔒 Accès Protégé</h2>
                <p>Une clé d'authentification valide est requise pour accéder au tableau de bord.</p>
            </body>
            </html>
        `);
    }

    next();
};

// Endpoints publics d'état d'authentification
app.get('/api/auth/status', (req, res) => {
    const authConfig = config.web?.auth || {};
    res.json({
        success: true,
        authRequired: !!authConfig.enabled,
        protectStatic: !!authConfig.protect_static
    });
});

app.post('/api/auth/verify', (req, res) => {
    const authConfig = config.web?.auth || {};
    const { apiKey } = req.body;
    const isValid = !authConfig.enabled || (apiKey && apiKey === authConfig.api_key);
    res.json({
        success: true,
        valid: isValid
    });
});

// Appliquer le middleware d'authentification
app.use(webAuthMiddleware);

// Servir l'interface web statique
const publicPath = path.join(__dirname, '../public');
if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
}
app.use(express.static(publicPath));

// Monter le routeur API Discord Web
app.use('/api', createWebRouter(client));

// Initialiser et monter l'architecture modulaire & EventBus (style NestJS / Angular)
const { moduleManager } = require('./core/index.js');
const { appModules } = require('./modules/index.js');
moduleManager.init(client, app);
moduleManager.registerModules(appModules);

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
// SPA Fallback pour le routage des pages Nuxt
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path === '/health') {
        return next();
    }
    const indexPath = path.join(publicPath, 'index.html');
    const fallback200 = path.join(publicPath, '200.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    } else if (fs.existsSync(fallback200)) {
        return res.sendFile(fallback200);
    }
    next();
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
    console.log(`🖥️  Interface Web: http://localhost:${PORT}/`);
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