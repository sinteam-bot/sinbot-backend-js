/**
 * src/web/webRouter.js
 *
 * Routeur principal de l'API Web et du Dashboard Discord.
 * Orchestre les contrôleurs modulaires spécialisés pour chaque domaine.
 */

const express = require('express');
const {
    createProxyRouter,
    createGuildRouter,
    createChannelsRouter,
    createUsersRouter,
    createConfigRouter,
    createOpenRouterRouter,
    createSystemLogsRouter,
    createCommandsRouter,
    createEventsRouter,
    createTemplatesRouter,
    createGamesRouter,
    createDailyMessagesRouter,
    createBumpRouter,
    createLeaderboardRouter
} = require('./controllers/index.js');

function createWebRouter(client) {
    const router = express.Router();

    // Middleware de validation des paramètres Discord (:channelId, :messageId, :userId)
    router.param('channelId', (req, res, next, value) => {
        // Accepter les salons virtuels du dashboard (cat-*, virtual-*)
        if (value.startsWith('cat-') || value.startsWith('virtual-')) return next();
        if (!/^\d{17,20}$/.test(value)) {
            return res.status(400).json({ success: false, error: `channelId invalide : "${value}"` });
        }
        next();
    });

    router.param('messageId', (req, res, next, value) => {
        if (!/^\d{17,20}$/.test(value)) {
            return res.status(400).json({ success: false, error: `messageId invalide : "${value}"` });
        }
        next();
    });

    router.param('userId', (req, res, next, value) => {
        if (!/^\d{17,20}$/.test(value)) {
            return res.status(400).json({ success: false, error: `userId invalide : "${value}"` });
        }
        next();
    });

    // 0. Proxy & Cache d'images / assets Discord
    router.use('/proxy', createProxyRouter(client));

    // 1. Informations du serveur / statut bot / emojis / rôles / sync cache
    router.use('/', createGuildRouter(client));

    // 2. Salons, messages, fils de discussion (threads) et forums
    router.use('/channels', createChannelsRouter(client));

    // 3. Utilisateurs, rôles et stats XP
    router.use('/', createUsersRouter(client));

    // 4. Configuration globale du bot et statut des modules
    router.use('/', createConfigRouter());

    // 5. OpenRouter (modèles et retry policy)
    router.use('/openrouter', createOpenRouterRouter());

    // 6. Logs système Winston/console et SSE
    router.use('/', createSystemLogsRouter());

    // 7. Commandes Discord et synchronisation
    router.use('/commands', createCommandsRouter(client));

    // 8. Archive des événements Discord
    router.use('/events', createEventsRouter());

    // 9. Templates de messages Discord
    router.use('/template', createTemplatesRouter());

    // 10. Jeux (Counter, Countdown, Stats)
    router.use('/games', createGamesRouter());

    // 11. Modules métier (Daily Messages, Captcha, Bump)
    router.use('/daily-messages', createDailyMessagesRouter(client));
    router.use('/bump', createBumpRouter(client));

    // 12. Classement public (XP & Économie)
    router.use('/leaderboard', createLeaderboardRouter(client));

    return router;
}

module.exports = createWebRouter;
