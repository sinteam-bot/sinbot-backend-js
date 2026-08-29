/**
 * ModLog — journal d'audit de toutes les actions de modération
 *
 * Écrit dans la table mod_logs (immutable) et envoie un embed dans le
 * salon de log configuré si disponible.
 */

const crypto = require('crypto');

function newId() {
    return crypto.randomUUID();
}

class ModLog {
    constructor() {
        this.logChannelId = null;
    }

    setLogChannel(channelId) {
        this.logChannelId = channelId;
    }

    /**
     * Publie une entrée de log
     * @param {import('discord.js').Guild} guild
     * @param {{ id: string }} targetUser
     * @param {{ id: string }} modUser
     * @param {string} action
     * @param {object} metadata
     */
    async publish(guild, targetUser, modUser, action, metadata = {}) {
        const { db } = require('../../../db/index.js');
        const now = Date.now();
        const id = newId();
        const meta = JSON.stringify(metadata);

        try {
            await db.pool.query(
                `INSERT INTO mod_logs (id, guild_id, user_id, mod_id, action, reason, metadata, source, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [id, guild.id, targetUser.id, modUser.id, action, metadata.reason || null, meta, metadata.source || 'manual', now]
            );
        } catch (err) {
            console.error(`[ModLog] DB insert failed: ${err.message}`);
        }

        if (this.logChannelId) {
            try {
                const channel = await guild.channels.fetch(this.logChannelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const { EmbedBuilder } = require('discord.js');
                    const embed = new EmbedBuilder()
                        .setColor(this._actionColor(action))
                        .setTitle(`🛡️ ${action.toUpperCase()}`)
                        .addFields(
                            { name: 'Cible', value: `<@${targetUser.id}>`, inline: true },
                            { name: 'Modérateur', value: `<@${modUser.id}>`, inline: true }
                        )
                        .setTimestamp(now);
                    if (metadata.reason) embed.addFields({ name: 'Raison', value: String(metadata.reason).slice(0, 1024) });
                    if (metadata.duration_ms) {
                        embed.addFields({ name: 'Durée', value: this._formatDuration(metadata.duration_ms), inline: true });
                    }
                    await channel.send({ embeds: [embed] }).catch(err => {
                        console.warn('[ModLog] Impossible d\'envoyer l\'embed de mod-log:', err.message);
                    });
                }
            } catch (err) {
                console.error(`[ModLog] Embed send failed: ${err.message}`);
            }
        }
    }

    _actionColor(action) {
        const map = {
            warn: 0xfee75c,
            mute: 0xed4245,
            kick: 0xed4245,
            ban: 0x992d22,
            unban: 0x57f287,
            clear: 0x5865f2
        };
        return map[action] || 0x99aab5;
    }

    _formatDuration(ms) {
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h`;
        const d = Math.floor(h / 24);
        return `${d}d`;
    }
}

module.exports = { ModLog };
