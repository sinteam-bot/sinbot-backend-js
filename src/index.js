const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { config } = require('./config/index.js');

// Initialise la DB (PGlite ou PG) + applique les migrations en arrière-plan.
// L'import de db/index.js force l'exécution du bootstrap.
const dbContext = require('./db/index.js');
if (dbContext.ready) {
    dbContext.ready.then(() => {
        console.log('✅ Base de données initialisée (migrations appliquées).');
    }).catch((err) => {
        console.error('❌ Erreur migrations DB:', err);
    });
}

const { logUserEvent, getUserEvents, getGlobalStats } = require("./db/schemas/shared/audit.repository.js");
const { loadCommands } = require("./utils/commandHandler.js");
const logger = require("./utils/logger.js");
const createWebRouter = require("./web/webRouter.js");
const { initDiscordEventTracker } = require("./utils/discordEventTracker.js");
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const createAuthRouter = require('./web/authRouter.js');
const cron = require('node-cron');
const { authService } = require('./services/auth.service.js');
const {
    timingSafeEqual,
    isDiscordSnowflake,
    validateChannelId,
    validateMessageContent,
    validateEmbed,
    verifyChannelBelongsToGuild,
    createRateLimiters,
    authenticateMiddleware,
    requireRole
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
// SERVEUR EXPRESS & SÉCURITÉ GLOBALE
// ============================================

const app = express();

// Configuration Reverse Proxy (Nginx, Traefik, Cloudflare, Docker)
app.set('trust proxy', 1);

// Redirection HTTPS automatique en production (exclut localhost et réseaux privés)
app.use((req, res, next) => {
    const host = req.headers.host || '';
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('::1') || host.startsWith('192.168.') || host.startsWith('10.') || host.includes('.local');
    if (process.env.NODE_ENV === 'production' && !isLocal) {
        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        if (proto !== 'https') {
            return res.redirect(301, `https://${host}${req.url}`);
        }
    }
    next();
});

// Headers de sécurité HTTP via Helmet
app.use(helmet({
    contentSecurityPolicy: false, // Laissé souple pour Nuxt SSR/SSG & Canvas
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: false // HSTS désactivé ici (délégué au reverse proxy Nginx/Cloudflare) pour éviter de bloquer localhost
}));

// Cookie Parser pour les cookies de session et refresh tokens HttpOnly
app.use(cookieParser());

// Body Parser avec limite de taille
app.use(express.json({ limit: '1mb' }));

// Rate limiters de sécurité (anti brute-force, anti spam)
const rateLimiters = createRateLimiters();
app.use(rateLimiters.global);

// Monter le routeur d'authentification OAuth2 Discord & JWT
app.use('/api/auth', createAuthRouter(client));

// Appliquer le middleware d'authentification globale avec RBAC
app.use(authenticateMiddleware());

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

// ============================================
// DOCUMENTATION OPENAPI 3.1 & SCALAR UI
// ============================================
const { OpenApiGenerator } = require('./core/index.js');
const openApiGenerator = new OpenApiGenerator({
    title: 'Bot Discord API',
    version: '1.0.0',
    description: 'Documentation interactive de l\'API REST & Webhooks du bot Discord.'
});

const openApiSpec = openApiGenerator.generateSpec({ app, moduleManager, client, config });
const openApiPath = path.join(__dirname, '../docs/openapi.json');
openApiGenerator.exportToFile(openApiPath, openApiSpec);

// Endpoints OpenAPI & Documentation interactive
app.get('/api/docs/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(openApiSpec);
});

app.get('/api/docs', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(openApiGenerator.getScalarHtml({
        title: 'Bot API Reference',
        specUrl: '/api/docs/openapi.json'
    }));
});
app.get('/docs', (req, res) => res.redirect('/api/docs'));

// SPA Fallback pour le routage des pages Nuxt
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path === '/health' || req.path.startsWith('/docs')) {
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
    console.log('🌐 SERVEUR WEBHOOK DÉMARRÉ !');
    console.log(`✅ Serveur sur le port: ${PORT}`);
    console.log(`🖥️  Interface Web: http://localhost:${PORT}/`);
    console.log(`📚 Documentation API: http://localhost:${PORT}/api/docs`);
    console.log(`📖 OpenAPI Spec: http://localhost:${PORT}/api/docs/openapi.json`);
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