/**
 * src/modules/util_teamspeak/services/teamspeak-logs.service.js
 *
 * Service d'enregistrement et de diffusion des logs d'actions TeamSpeak 3
 * (connexions, déconnexions, déplacements, etc.) vers un salon Discord et la BDD.
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { eventBus } = require('../../../core/event-bus.js');
const logger = require('../../../utils/logger.js');

class TeamSpeakLogsService extends EventEmitter {
    static inject = [];

    constructor() {
        super();
        this._config = null;
        this._client = null;
    }

    /**
     * Définit le client Discord.
     */
    setClient(client) {
        this._client = client;
    }

    /**
     * Définit la configuration des logs.
     */
    setConfig(config) {
        this._config = config || {};
    }

    /**
     * Vérifie si un type d'événement est activé dans la config.
     */
    isEventEnabled(eventType) {
        if (!this._config) return true;
        if (this._config.enabled === false) return false;
        if (!this._config.events) return true;

        const mapping = {
            ts3_client_connect: 'client_connect',
            ts3_client_disconnect: 'client_disconnect',
            ts3_client_moved: 'client_moved',
            ts3_channel_create: 'channel_create',
            ts3_channel_delete: 'channel_delete',
            ts3_server_edit: 'server_edit'
        };

        const configKey = mapping[eventType] || eventType;
        return this._config.events[configKey] !== false;
    }

    /**
     * Construit un Embed Discord pour un log TeamSpeak 3.
     */
    buildLogEmbed(eventType, data = {}) {
        const defaultColors = {
            ts3_client_connect: 0x57F287,    // Vert
            ts3_client_disconnect: 0xED4245, // Rouge
            ts3_client_moved: 0x5865F2,      // Bleu
            ts3_channel_create: 0xFEE75C,    // Jaune
            ts3_channel_delete: 0xE67E22,    // Orange
            ts3_server_edit: 0x9B59B6        // Violet
        };

        const titles = {
            ts3_client_connect: '🟢 [TeamSpeak] Connexion',
            ts3_client_disconnect: '🔴 [TeamSpeak] Déconnexion',
            ts3_client_moved: '🔄 [TeamSpeak] Déplacement',
            ts3_channel_create: '📁 [TeamSpeak] Salon créé',
            ts3_channel_delete: '🗑️ [TeamSpeak] Salon supprimé',
            ts3_server_edit: '⚙️ [TeamSpeak] Configuration modifiée'
        };

        const color = data.color || defaultColors[eventType] || 0x2580EB;
        const title = titles[eventType] || `📋 [TeamSpeak] ${eventType}`;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setTimestamp();

        if (data.summary) {
            embed.setDescription(data.summary);
        }

        if (data.nickname) {
            embed.addFields({ name: 'Utilisateur', value: `**${data.nickname}**`, inline: true });
        }

        if (data.channelName) {
            embed.addFields({ name: 'Salon', value: data.channelName, inline: true });
        }

        if (data.fromChannel && data.toChannel) {
            embed.addFields(
                { name: 'Ancien salon', value: data.fromChannel, inline: true },
                { name: 'Nouveau salon', value: data.toChannel, inline: true }
            );
        }

        if (data.reason) {
            embed.addFields({ name: 'Raison', value: data.reason, inline: true });
        }

        if (data.invoker) {
            embed.addFields({ name: 'Par', value: data.invoker, inline: true });
        }

        embed.setFooter({ text: 'TeamSpeak 3 Event Logger' });
        return embed;
    }

    /**
     * Enregistre un événement (BDD event_log) et le poste sur Discord si configuré.
     * @param {string} guildId
     * @param {string} eventType
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    async log(guildId, eventType, data = {}) {
        if (!this.isEventEnabled(eventType)) {
            return null;
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        const metadata = JSON.stringify(data.metadata || data);
        const channelId = this._config?.channel_id || null;

        // 1. Sauvegarde en Base de Données (table event_log)
        try {
            const { db } = require('../../../db/index.js');
            if (db?.pool?.query) {
                await db.pool.query(
                    `INSERT INTO event_log (id, guild_id, event_type, actor_id, target_id, channel_id, metadata, summary, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        id,
                        guildId || 'unknown',
                        eventType,
                        data.nickname || data.actorId || null,
                        data.targetId || null,
                        channelId,
                        metadata,
                        data.summary || null,
                        now
                    ]
                );
            }
        } catch (err) {
            logger.warn(`[TeamSpeakLogs] Erreur insertion DB: ${err.message}`, 'TEAMSPEAK');
        }

        const entry = {
            id,
            guild_id: guildId,
            event_type: eventType,
            nickname: data.nickname,
            summary: data.summary,
            metadata: data.metadata || data,
            created_at: now
        };

        // 2. Émission d'événements internes pour le WebSocket du dashboard
        try {
            this.emit('log.published', entry);
            eventBus.emit('teamspeak:log', entry);
            eventBus.emit('log.published', entry);
        } catch (err) {
            // Silencieux
        }

        // 3. Envoi sur le salon Discord dédié aux logs si configuré
        if (channelId && this._client) {
            try {
                const targetChannel = await this._client.channels.fetch(channelId).catch(() => null);
                if (targetChannel && targetChannel.isTextBased()) {
                    const embed = this.buildLogEmbed(eventType, data);
                    await targetChannel.send({ embeds: [embed] }).catch(err => {
                        logger.warn(`[TeamSpeakLogs] Erreur envoi Discord: ${err.message}`, 'TEAMSPEAK');
                    });
                }
            } catch (err) {
                logger.warn(`[TeamSpeakLogs] Erreur fetch salon logs: ${err.message}`, 'TEAMSPEAK');
            }
        }

        return entry;
    }

    /**
     * Lit les logs TeamSpeak depuis la base de données avec pagination.
     */
    async listLogs({ guildId, page = 1, limit = 50 } = {}) {
        const { db } = require('../../../db/index.js');
        if (!db?.pool?.query) {
            return { logs: [], total: 0, page, limit, pages: 0 };
        }

        const where = [`event_type LIKE 'ts3_%'`];
        const args = [];

        if (guildId) {
            args.push(guildId);
            where.push(`guild_id = $${args.length}`);
        }

        const whereSql = `WHERE ${where.join(' AND ')}`;
        args.push(limit, (Math.max(page, 1) - 1) * limit);

        const sql = `SELECT * FROM event_log ${whereSql} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`;
        const result = await db.pool.query({ text: sql, values: args });

        const countArgs = args.slice(0, args.length - 2);
        const countRes = await db.pool.query({
            text: `SELECT COUNT(*)::int AS total FROM event_log ${whereSql}`,
            values: countArgs
        });

        const total = countRes.rows?.[0]?.total || 0;

        return {
            logs: result.rows || [],
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        };
    }
}

Injectable()(TeamSpeakLogsService);

module.exports = { TeamSpeakLogsService };
