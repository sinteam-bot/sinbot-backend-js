/**
 * src/web/controllers/commands.controller.js
 *
 * Commandes Discord du bot et synchronisation des commandes slash.
 */

const express = require('express');
const { createRateLimiters, requireRole } = require('../../utils/security.js');

function createCommandsRouter(client) {
    const router = express.Router();
    const rateLimiters = createRateLimiters();

    // GET /commands
    router.get('/', async (req, res) => {
        try {
            const { getConfig } = require('../../config/index.js');
            const conf = getConfig();
            const cmdConfig = conf.discord?.commands || {};
            const commandsList = [];

            if (client && client.commands) {
                const seen = new Set();
                client.commands.forEach((cmd, name) => {
                    const cmdName = cmd.data?.name || name;
                    if (!seen.has(cmdName.toLowerCase())) {
                        seen.add(cmdName.toLowerCase());
                        commandsList.push({
                            name: cmdName,
                            description: cmd.data?.description || cmd.description || 'Pas de description',
                            options: cmd.data?.options || [],
                            module: cmd.module || 'Système',
                            type: cmd.executeSlash ? 'Slash Command' : 'Prefix Command',
                            adminOnly: !!cmdConfig.permissions?.[cmdName]?.admin_only,
                            allowedRoles: cmdConfig.permissions?.[cmdName]?.allowed_roles || [],
                            allowedChannels: cmdConfig.permissions?.[cmdName]?.allowed_channels || []
                        });
                    }
                });
            }

            res.json({
                success: true,
                data: {
                    globalEnabled: cmdConfig.enabled !== false,
                    commands: commandsList,
                    config: cmdConfig
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /commands/sync
    router.post('/sync', rateLimiters.sensitive, requireRole('admin'), async (req, res) => {
        try {
            const { syncDiscordSlashCommands } = require('../../utils/commandDeployer.js');
            const result = await syncDiscordSlashCommands(client, req.body || {});
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createCommandsRouter;
