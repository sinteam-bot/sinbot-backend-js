/**
 * LogsService — service central d'enregistrement et de diffusion
 *
 * Trois responsabilités :
 *  1) Persister chaque event dans event_log
 *  2) Poster un embed dans le salon Discord configuré (si applicable)
 *  3) Émettre un event interne 'log.published' consommé par le WS
 *     du dashboard pour le live feed
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { Sanitizer } = require('./sanitizer.service.js');

function newId() {
    return crypto.randomUUID();
}

class LogsService extends EventEmitter {
    static inject = [];

    constructor() {
        super();
        this.sanitizer = new Sanitizer();
        this._config = null;
    }

    setConfig(config) {
        this._config = config || {};
        this.sanitizer.setConfig(config);
    }

    /**
     * Récupère le channel Discord cible pour un type d'event
     */
    _channelForType(eventType) {
        if (!this._config?.channels) return null;
        if (eventType.startsWith('member_')) return this._config.channels.members;
        if (eventType.startsWith('message_')) return this._config.channels.messages;
        if (eventType.startsWith('role_')) return this._config.channels.roles;
        if (eventType.startsWith('channel_')) return this._config.channels.channels_log;
        if (eventType.startsWith('voice_')) return this._config.channels.voice;
        if (eventType === 'guild_update' || eventType.startsWith('emoji_')) return this._config.channels.server;
        if (eventType.startsWith('ban_')) return this._config.channels.moderation;
        return this._config.channels.server;
    }

    /**
     * Vérifie si l'event doit être ignoré (canal/user whitelist)
     */
    _isIgnored(guild, data) {
        const ignoredChannels = this._config?.ignored_channels || [];
        const ignoredUsers = this._config?.ignored_users || [];
        if (data.channelId && ignoredChannels.includes(data.channelId)) return true;
        if (data.actorId && ignoredUsers.includes(data.actorId)) return true;
        if (data.targetId && ignoredUsers.includes(data.targetId)) return true;
        return false;
    }

    /**
     * Détermine si un type d'event est activé
     */
    _isEnabled(eventType) {
        if (!this._config?.events) return true;
        if (this._config.events[eventType] === false) return false;
        return true;
    }

    /**
     * Construit l'embed générique pour un type d'event
     */
    _buildEmbed(eventType, data) {
        const color = parseInt((this._config?.color || '#2F3136').replace('#', ''), 16) || 0x2F3136;
        const title = this._titleFor(eventType);
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setTimestamp();

        if (data.actorId) embed.addFields({ name: 'Acteur', value: `<@${data.actorId}>`, inline: true });
        if (data.targetId) embed.addFields({ name: 'Cible', value: `<@${data.targetId}>`, inline: true });
        if (data.channelId) embed.addFields({ name: 'Salon', value: `<#${data.channelId}>`, inline: true });
        if (data.summary) embed.setDescription(this.sanitizer.truncate(data.summary, 200));
        if (data.content) embed.addFields({ name: 'Contenu', value: this.sanitizer.cleanContent(data.content) });

        return embed;
    }

    _titleFor(eventType) {
        const titles = {
            message_delete: '🗑️ Message supprimé',
            message_edit: '✏️ Message modifié',
            message_bulk_delete: '🗑️ Suppression en masse',
            member_join: '➕ Membre arrivé',
            member_leave: '➖ Membre parti',
            member_update: '🔄 Membre modifié',
            member_ban_add: '🔨 Membre banni',
            member_ban_remove: '🔓 Membre débanni',
            role_create: '➕ Rôle créé',
            role_update: '✏️ Rôle modifié',
            role_delete: '➖ Rôle supprimé',
            channel_create: '➕ Salon créé',
            channel_update: '✏️ Salon modifié',
            channel_delete: '➖ Salon supprimé',
            voice_state_update: '🔊 Vocal',
            guild_update: '⚙️ Serveur modifié',
            emoji_create: '😀 Emoji ajouté',
            emoji_delete: '🗑️ Emoji supprimé'
        };
        return titles[eventType] || `📋 ${eventType}`;
    }

    /**
     * Point d'entrée principal : enregistre + diffuse un event
     */
    async log(guild, eventType, data = {}) {
        if (!this._config) return null;
        if (!this._isEnabled(eventType)) return null;
        if (guild && this._isIgnored(guild, data)) return null;

        const id = newId();
        const now = Date.now();
        const metadata = data.metadata ? JSON.stringify(data.metadata) : null;

        const { db } = require('../../../db/index.js');
        try {
            await db.pool.query(
                `INSERT INTO event_log (id, guild_id, event_type, actor_id, target_id, channel_id, metadata, summary, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [id, guild?.id || 'unknown', eventType, data.actorId || null, data.targetId || null, data.channelId || null, metadata, data.summary || null, now]
            );
        } catch (err) {
            console.error(`[LogsService] DB insert failed: ${err.message}`);
        }

        const entry = {
            id,
            guild_id: guild?.id,
            event_type: eventType,
            actor_id: data.actorId,
            target_id: data.targetId,
            channel_id: data.channelId,
            summary: data.summary,
            metadata: data.metadata || null,
            created_at: now
        };

        try {
            this.emit('log.published', entry);
        } catch {}

        if (guild && this._config?.format === 'embed') {
            try {
                const channelId = this._channelForType(eventType);
                if (channelId) {
                    const channel = await guild.channels.fetch(channelId).catch(() => null);
                    if (channel && channel.isTextBased()) {
                        const embed = this._buildEmbed(eventType, data);
                        await channel.send({ embeds: [embed] }).catch(() => {});
                    }
                }
            } catch (err) {
                console.error(`[LogsService] embed send failed: ${err.message}`);
            }
        }

        return entry;
    }

    /**
     * Lit les logs en BDD avec filtres et pagination
     */
    async list({ guildId, eventType, actorId, targetId, channelId, page = 1, limit = 50 } = {}) {
        const { db } = require('../../../db/index.js');
        const where = [];
        const args = [];
        if (guildId) { args.push(guildId); where.push(`guild_id = $${args.length}`); }
        if (eventType) { args.push(eventType); where.push(`event_type = $${args.length}`); }
        if (actorId) { args.push(actorId); where.push(`actor_id = $${args.length}`); }
        if (targetId) { args.push(targetId); where.push(`target_id = $${args.length}`); }
        if (channelId) { args.push(channelId); where.push(`channel_id = $${args.length}`); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        args.push(limit, (Math.max(page, 1) - 1) * limit);
        const sql = `SELECT * FROM event_log ${whereSql} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`;
        const result = await db.pool.query({ text: sql, values: args });
        const countArgs = args.slice(0, args.length - 2);
        const countRes = await db.pool.query({ text: `SELECT COUNT(*)::int AS total FROM event_log ${whereSql}`, values: countArgs });
        return {
            logs: result.rows || [],
            total: countRes.rows?.[0]?.total || 0,
            page,
            limit,
            pages: Math.ceil((countRes.rows?.[0]?.total || 0) / limit)
        };
    }
}

Injectable()(LogsService);

module.exports = { LogsService };
