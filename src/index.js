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
const {
    timingSafeEqual,
    isDiscordSnowflake,
    validateChannelId,
    validateMessageContent,
    validateEmbed,
    verifyChannelBelongsToGuild,
    createRateLimiters
} = require('./utils/security.js');

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
app.use(express.json({ limit: '1mb' }));

// Rate limiters de sécurité (anti brute-force, anti spam)
const rateLimiters = createRateLimiters();
app.use(rateLimiters.global);

// Middleware de protection et d'authentification Web / API
const webAuthMiddleware = (req, res, next) => {
    const authConfig = config.web?.auth || {};

    // 1. Si la protection est désactivée, passer immédiatement
    if (!authConfig.enabled) {
        return next();
    }

    // 2. Endpoints toujours publics : health check, statut auth et proxy d'images Discord
    if (req.path === '/health' || req.path === '/api/auth/status' || req.path === '/api/auth/verify' || req.path.startsWith('/api/proxy/')) {
        return next();
    }

    // 3. Vérification de la liste blanche d'adresses IP si configurée
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    if (authConfig.allowed_ips && Array.isArray(authConfig.allowed_ips) && authConfig.allowed_ips.length > 0) {
        if (authConfig.allowed_ips.includes(clientIp) || clientIp === '127.0.0.1' || clientIp === '::1') {
            return next();
        }
    }

    // 4. Extraction du token / clé d'API (headers uniquement — pas de query string pour éviter le logging)
    let providedKey = req.headers['x-api-key'];

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

    // Comparaison en temps constant pour prévenir les attaques temporelles (timing attack)
    if (providedKey && expectedKey && timingSafeEqual(providedKey, expectedKey)) {
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

// Rate limiter strict sur l'endpoint de vérification (anti brute-force)
app.post('/api/auth/verify', rateLimiters.auth, (req, res) => {
    const authConfig = config.web?.auth || {};
    const { apiKey } = req.body;
    // Comparaison en temps constant pour prévenir les attaques temporelles
    const isValid = !authConfig.enabled || (apiKey && authConfig.api_key && timingSafeEqual(apiKey, authConfig.api_key));
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

// Routeur Features (Phase 0) — branché après l'enregistrement des modules
// pour que le FeatureRegistry connaisse déjà toutes les features déclarées.
const createFeaturesRouter = require('./web/featuresRouter.js');
app.use('/api/features', createFeaturesRouter());

// Endpoint pour envoyer un message depuis n8n (rate limited + validé)
app.post('/webhook/send-message', rateLimiters.webhook, async (req, res) => {
    const { channelId, message, embed } = req.body;

    // Validation du channelId
    const channelCheck = validateChannelId(channelId);
    if (!channelCheck.valid) {
        return res.status(400).json({ success: false, error: channelCheck.reason });
    }

    // Validation du contenu du message
    if (!embed) {
        const contentCheck = validateMessageContent(message);
        if (!contentCheck.valid) {
            return res.status(400).json({ success: false, error: contentCheck.reason });
        }
    }

    // Validation de l'embed si fourni
    if (embed) {
        const embedCheck = validateEmbed(embed);
        if (!embedCheck.valid) {
            return res.status(400).json({ success: false, error: embedCheck.reason });
        }
    }

    try {
        // Vérifier que le salon appartient bien au serveur configuré
        const access = await verifyChannelBelongsToGuild(client, channelId);
        if (!access.allowed) {
            return res.status(403).json({ success: false, error: access.reason });
        }

        const channel = access.channel || await client.channels.fetch(channelId);

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
            error: 'Erreur lors de l\'envoi du message'
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
    // Validation du userId
    if (!isDiscordSnowflake(req.params.userId)) {
        return res.status(400).json({ success: false, error: 'userId invalide' });
    }

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
            error: 'Erreur lors de la récupération des événements'
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
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
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
const httpServer = app.listen(PORT, () => {
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

// WebSocket Live Feed des logs (Phase 4)
try {
    const { LogsService } = require('./modules/feature_logs/services/logs.service.js');
    const { attachLogsWs } = require('./utils/wsLogsServer.js');
    const { container } = require('./core/index.js');
    let logsService = null;
    if (container.has('LogsService')) {
        logsService = container.resolve('LogsService');
    } else {
        logsService = new LogsService();
    }
    const authConfig = (config && config.web && config.web.auth) || {};
    attachLogsWs(httpServer, logsService, authConfig);
    console.log('🔌 WS /ws/logs prêt (live feed)');
} catch (err) {
    console.warn(`⚠️  WS logs non disponible: ${err.message}`);
}

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