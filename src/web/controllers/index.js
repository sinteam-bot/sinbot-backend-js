/**
 * src/web/controllers/index.js
 *
 * Export centralisé de tous les contrôleurs et sous-routeurs de l'interface Web.
 */

const createProxyRouter = require('./proxy.controller.js');
const createGuildRouter = require('./guild.controller.js');
const createChannelsRouter = require('./channels.controller.js');
const createUsersRouter = require('./users.controller.js');
const createConfigRouter = require('./config.controller.js');
const createOpenRouterRouter = require('./openrouter.controller.js');
const createSystemLogsRouter = require('./system-logs.controller.js');
const createCommandsRouter = require('./commands.controller.js');
const createEventsRouter = require('./events.controller.js');
const createTemplatesRouter = require('./templates.controller.js');
const createGamesRouter = require('./games.controller.js');
const createDailyMessagesRouter = require('./daily-messages.controller.js');
const createBumpRouter = require('./bump.controller.js');
const createLeaderboardRouter = require('./leaderboard.controller.js');

module.exports = {
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
};
