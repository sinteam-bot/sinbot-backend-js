/**
 * src/web/controllers/games.controller.js
 *
 * Vue d'ensemble et statistiques des mini-jeux (Counter & Countdown).
 */

const express = require('express');
const logger = require('../../utils/logger.js');
const { GameStateRepository } = require('../../db/schemas/shared/game-state.repository.js');

function createGamesRouter() {
    const router = express.Router();
    const gameStateRepo = new GameStateRepository();

    // GET /games/counter
    router.get('/counter', async (req, res) => {
        try {
            const { getConfig } = require('../../config/index.js');
            const conf = getConfig();
            const channelId = conf.counter?.channel_id || '1533492692825276598';
            const state = await gameStateRepo.getCounterState(channelId);
            const scores = await gameStateRepo.getCountdownScores(channelId);
            res.json({
                success: true,
                data: {
                    channelId,
                    state: state || { current_number: 0, last_user_id: null },
                    scores: scores || [],
                    config: conf.counter || {}
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /games/countdown
    router.get('/countdown', async (req, res) => {
        try {
            const { getConfig } = require('../../config/index.js');
            const conf = getConfig();
            const channelId = conf.countdown?.channel_id || '1533492760697503805';
            const state = await gameStateRepo.getCountdownState(channelId);
            const scores = await gameStateRepo.getCountdownScores(channelId);
            res.json({
                success: true,
                data: {
                    channelId,
                    state: state || { current_number: conf.countdown?.start_number || 900, is_trap_active: 0 },
                    scores: scores || [],
                    config: conf.countdown || {}
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /games/stats (Vue d'ensemble agrégée)
    router.get('/stats', async (req, res) => {
        try {
            const { getConfig } = require('../../config/index.js');
            const conf = getConfig();
            const counterChannel = conf.counter?.channel_id;
            const countdownChannel = conf.countdown?.channel_id;
            const [counterState, countdownState, counterScores, countdownScores] = await Promise.all([
                counterChannel ? gameStateRepo.getCounterState(counterChannel).catch(() => null) : null,
                countdownChannel ? gameStateRepo.getCountdownState(countdownChannel).catch(() => null) : null,
                counterChannel ? gameStateRepo.getCountdownScores(counterChannel, 100).catch(() => []) : [],
                countdownChannel ? gameStateRepo.getCountdownScores(countdownChannel, 100).catch(() => []) : []
            ]);
            res.json({
                success: true,
                data: {
                    counter: {
                        configured: !!counterChannel,
                        channelId: counterChannel,
                        state: counterState,
                        topPlayers: counterScores.slice(0, 10)
                    },
                    countdown: {
                        configured: !!countdownChannel,
                        channelId: countdownChannel,
                        state: countdownState,
                        topPlayers: countdownScores.slice(0, 10)
                    },
                    enabled: {
                        counter: conf.counter?.enabled !== false,
                        countdown: conf.countdown?.enabled !== false
                    }
                }
            });
        } catch (error) {
            logger.error(`Erreur GET /api/games/stats: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createGamesRouter;
