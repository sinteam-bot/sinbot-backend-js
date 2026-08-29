/**
 * src/web/controllers/proxy.controller.js
 *
 * Proxy & Cache d'images / assets Discord (avatars, emojis, images)
 */

const express = require('express');
const { imageProxyService } = require('../../services/imageProxyService.js');
const { getGuild, getUserAvatar } = require('./discord-helpers.js');

function createProxyRouter(client) {
    const router = express.Router();

    router.get('/image', (req, res) => imageProxyService.handleRequest(req, res));

    router.get('/avatar/:userId', async (req, res) => {
        const { userId } = req.params;
        try {
            const guild = await getGuild(client);
            const member = guild ? (await guild.members.fetch(userId).catch(() => guild.members.cache.get(userId))) : null;
            const user = member?.user || (client?.users ? (await client.users.fetch(userId).catch(() => client.users.cache.get(userId))) : null);
            const avatarUrl = getUserAvatar(user || { id: userId }, member);
            req.query.url = avatarUrl;
            return imageProxyService.handleRequest(req, res);
        } catch {
            const defaultIndex = (Number(userId) || 0) % 5;
            req.query.url = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
            return imageProxyService.handleRequest(req, res);
        }
    });

    router.get('/emoji/:emojiId', (req, res) => {
        const { emojiId } = req.params;
        const isAnimated = req.query.animated === 'true' || req.query.animated === '1';
        const ext = isAnimated ? 'gif' : 'png';
        req.query.url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=64&quality=lossless`;
        return imageProxyService.handleRequest(req, res);
    });

    return router;
}

module.exports = createProxyRouter;
