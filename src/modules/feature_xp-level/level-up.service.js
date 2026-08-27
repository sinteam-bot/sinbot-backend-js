/**
 * level-up.service.js — gestion des annonces de level-up
 *
 * Centralise :
 *  - Le format du message (embed configurable)
 *  - Le canal de destination (config ou salon courant)
 *  - L'attribution / retrait des rôles de récompense par palier
 *  - L'option ping utilisateur
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');

const DEFAULT_TEMPLATE = '🎉 Bravo {user} ! Tu passes au **niveau {level}** !';

class LevelUpService {
    constructor() {
        this._config = null;
    }

    /**
     * Met à jour la config de level-up (reconfig à chaud)
     */
    setConfig(config) {
        this._config = this._mergeDefaults(config);
    }

    _mergeDefaults(config) {
        const c = config || {};
        return {
            enabled: c.enabled !== false,
            channel_id: c.channel_id || null,
            template: c.template || DEFAULT_TEMPLATE,
            color: c.color || '#f2c7ce',
            ping_user: c.ping_user !== false,
            show_rank: c.show_rank !== false,
            show_total_xp: c.show_total_xp !== false,
            dm_user: !!c.dm_user
        };
    }

    /**
     * Détermine si l'event doit être annoncé
     */
    isEnabled() {
        return !!(this._config && this._config.enabled);
    }

    _renderTemplate(template, vars) {
        return String(template)
            .replace(/\{user\}/g, `<@${vars.userId}>`)
            .replace(/\{username\}/g, vars.username || 'Utilisateur')
            .replace(/\{level\}/g, String(vars.level))
            .replace(/\{totalXp\}/g, String(vars.totalXp ?? 0))
            .replace(/\{rank\}/g, vars.rank ? `#${vars.rank}` : '');
    }

    /**
     * Construit l'embed de level-up
     */
    buildEmbed({ user, level, totalXp, rank }) {
        const cfg = this._config;
        const description = this._renderTemplate(cfg.template, {
            userId: user.id,
            username: user.username,
            level,
            totalXp,
            rank
        });
        const embed = new EmbedBuilder()
            .setColor(cfg.color)
            .setTitle('🎉 Niveau supérieur !')
            .setDescription(description)
            .setThumbnail(user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : null)
            .setTimestamp();
        const fields = [];
        if (cfg.show_total_xp) fields.push({ name: '✨ Total XP', value: `${totalXp}`, inline: true });
        if (cfg.show_rank && rank) fields.push({ name: '🏆 Rang', value: `#${rank}`, inline: true });
        if (fields.length) embed.addFields(fields);
        return embed;
    }

    /**
     * Envoie l'annonce de level-up
     * @param {import('discord.js').Guild} guild
     * @param {import('discord.js').User} user
     * @param {import('discord.js').GuildMember|null} fallbackMember membre (pour le salon courant)
     * @param {object} payload { level, totalXp, rank }
     */
    async announce(guild, user, fallbackMember, payload) {
        if (!this.isEnabled()) return;
        const cfg = this._config;
        let channel = null;
        if (cfg.channel_id) {
            channel = await guild.channels.fetch(cfg.channel_id).catch(() => null);
        }
        if (!channel && fallbackMember) {
            const currentChannelId = fallbackMember.lastMessage?.channelId || fallbackMember.voice?.channelId;
            if (currentChannelId) {
                channel = await guild.channels.fetch(currentChannelId).catch(() => null);
            }
        }
        if (!channel) return;

        const embed = this.buildEmbed({ user, ...payload });
        const content = cfg.ping_user ? `<@${user.id}>` : null;
        try {
            await channel.send({ content, embeds: [embed] });
        } catch (err) {
            console.error(`[LevelUpService] send failed: ${err.message}`);
        }

        if (cfg.dm_user) {
            try {
                await user.send({ embeds: [embed] });
            } catch {}
        }
    }

    /**
     * Attribue (et retire si cumulable=false) les rôles de récompense
     * @param {import('discord.js').Guild} guild
     * @param {import('discord.js').GuildMember} member
     * @param {number} newLevel
     * @param {Record<number,string>} levelRoles (level -> roleId)
     * @param {{ cumulable?: boolean }} options
     */
    async applyRewardRoles(guild, member, newLevel, levelRoles, options = {}) {
        if (!guild || !member || !levelRoles) return [];
        const cumulable = options.cumulable === true;
        const entries = Object.entries(levelRoles)
            .map(([lvl, rid]) => ({ level: parseInt(lvl, 10), roleId: String(rid) }))
            .filter(e => !isNaN(e.level) && e.roleId)
            .sort((a, b) => a.level - b.level);
        const toAdd = entries.filter(e => e.level <= newLevel).map(e => e.roleId);

        const toRemove = cumulable ? [] : entries.filter(e => e.level > newLevel).map(e => e.roleId);
        const results = { added: [], removed: [], skipped: [] };

        for (const roleId of toAdd) {
            try {
                if (!member.roles.cache.has(roleId)) {
                    await member.roles.add(roleId);
                    results.added.push(roleId);
                } else {
                    results.skipped.push(roleId);
                }
            } catch (err) {
                results.skipped.push(roleId);
                console.warn(`[LevelUpService] cannot add role ${roleId}: ${err.message}`);
            }
        }

        for (const roleId of toRemove) {
            try {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId);
                    results.removed.push(roleId);
                }
            } catch (err) {
                console.warn(`[LevelUpService] cannot remove role ${roleId}: ${err.message}`);
            }
        }

        return results;
    }
}

Injectable()(LevelUpService);

module.exports = { LevelUpService };
