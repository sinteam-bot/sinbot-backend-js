/**
 * src/modules/util_custom_commands/events/message-create.listener.js
 *
 * Déclenche les custom commands configurées (préfixe "!") avec support des tags (Phase 8 G44, G19, G43).
 */

const { EmbedBuilder } = require('discord.js');
const { OnEvent } = require('../../../core/index.js');
const { CustomCommandService } = require('../services/custom-command.service.js');
const { parseCommandTags } = require('../../../utils/commandTagParser.js');
const { pool } = require('../../../db/index.js');
const logger = require('../../../utils/logger.js');

class CustomCommandsMessageListener {
    static inject = [CustomCommandService];

    constructor(customs) {
        this.customs = customs;
        this._cacheReady = false;
    }

    async _ensureCache(guildId) {
        if (this._cacheReady) return;
        await this.customs.loadCache(guildId).catch(err =>
            logger.warn(`[CustomCommandsListener] Erreur cache: ${err.message}`, 'CUSTOM_CMD')
        );
        this._cacheReady = true;
    }

    async _isEnabled(guildId) {
        const { featureRegistry } = require('../../../core/feature-registry.js');
        const state = await featureRegistry.get(guildId, 'custom_commands');
        return state.enabled;
    }

    async handle(message) {
        if (!message?.guild) return;
        if (message.author?.bot) return;

        const enabled = await this._isEnabled(message.guild.id);
        if (!enabled) return;

        await this._ensureCache(message.guild.id);
        const content = (message.content || '').trim();
        if (!content.startsWith('!')) return;

        const parts = content.slice(1).split(/\s+/);
        const name = parts[0]?.toLowerCase();
        if (!name) return;

        const cmd = await this.customs.find(message.guild.id, name);
        if (!cmd) return;

        const ok = this.customs.canRun(cmd, message, message.member);
        if (!ok.ok) return;

        this.customs.incrementCooldown(cmd);
        const args = parts.slice(1);
        await this._fireCustomCommand(cmd, message, args);
    }

    async _fireCustomCommand(cmd, message, args = []) {
        try {
            // Récupérer XP et Coins si disponibles
            let xp = 0;
            let level = 1;
            let coins = 0;

            try {
                const xpRes = await pool.query(`SELECT xp, level FROM user_xp WHERE user_id = $1 LIMIT 1`, [message.author.id]);
                if (xpRes.rows?.[0]) {
                    xp = xpRes.rows[0].xp || 0;
                    level = xpRes.rows[0].level || 1;
                }
            } catch { }

            try {
                const ecoRes = await pool.query(
                    `SELECT balance FROM user_economy WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
                    [message.guild.id, message.author.id]
                );
                if (ecoRes.rows?.[0]) {
                    coins = ecoRes.rows[0].balance || 0;
                }
            } catch { }

            const context = {
                member: message.member,
                user: message.author,
                guild: message.guild,
                channel: message.channel,
                message,
                args,
                level,
                xp,
                coins
            };

            const payload = {};

            if (cmd.responseText) {
                const parsed = await parseCommandTags(cmd.responseText, context);
                if (parsed.text) payload.content = parsed.text;
            }

            if (cmd.responseEmbed || cmd.responseEmbedJson) {
                const embedData = typeof cmd.responseEmbedJson === 'string'
                    ? JSON.parse(cmd.responseEmbedJson)
                    : (cmd.responseEmbed || {});

                const embed = new EmbedBuilder();
                if (embedData.title) {
                    const parsedTitle = await parseCommandTags(embedData.title, context, { executeActions: false });
                    embed.setTitle(parsedTitle.text);
                }
                if (embedData.description) {
                    const parsedDesc = await parseCommandTags(embedData.description, context, { executeActions: false });
                    embed.setDescription(parsedDesc.text);
                }
                if (embedData.color) embed.setColor(embedData.color);
                payload.embeds = [embed];
            }

            if (payload.content || payload.embeds?.length) {
                await message.channel.send(payload);
            }
        } catch (err) {
            logger.warn(`Erreur exécution custom command ${cmd.name}: ${err.message}`, 'CUSTOM_CMD');
        }
    }
}

OnEvent('messageCreate', {
    configKey: 'features.custom_commands',
    priority: 36
})(CustomCommandsMessageListener.prototype, 'handle');

module.exports = { CustomCommandsMessageListener };
