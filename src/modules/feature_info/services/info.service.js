/**
 * info.service.js — services d'info (server / user / avatar)
 *
 * Toutes les méthodes retournent un objet plain qui sera sérialisé
 * par le controller REST ou consommé directement par les commands
 * discord pour construire l'embed.
 */

const { EmbedBuilder } = require('discord.js');

class InfoService {
    static inject = [];

    constructor() {
        this._client = null;
    }

    setClient(client) {
        this._client = client;
    }

    /**
     * Construit un embed d'info serveur.
     */
    buildServerEmbed(guild, config) {
        const color = parseInt((config?.color || '#5865F2').replace('#', ''), 16);
        const showId = config?.show_id !== false;
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`🏛️ ${guild.name}`)
            .setThumbnail(guild.iconURL?.({ dynamic: true, size: 256 }) || null)
            .addFields(
                { name: '👥 Membres', value: `${guild.memberCount || 'N/A'}`, inline: true },
                { name: '📅 Créé le', value: guild.createdAt ? `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:R>` : 'N/A', inline: true },
                { name: '👑 Propriétaire', value: guild.ownerId ? `<@${guild.ownerId}>` : 'N/A', inline: true },
                { name: '📝 Salons', value: `${guild.channels?.cache?.size || 0}`, inline: true },
                { name: '🎭 Rôles', value: `${guild.roles?.cache?.size || 0}`, inline: true },
                { name: '😀 Emojis', value: `${guild.emojis?.cache?.size || 0}`, inline: true }
            )
            .setTimestamp();
        if (showId) {
            embed.addFields({ name: '🆔 ID', value: `\`${guild.id}\`` });
        }
        if (config?.footer) embed.setFooter({ text: config.footer });
        return embed;
    }

    /**
     * Construit un embed d'info utilisateur.
     */
    buildUserEmbed(user, member, config) {
        const color = parseInt((config?.color || '#5865F2').replace('#', ''), 16);
        const showId = config?.show_id !== false;
        const isBot = user.bot;
        const embed = new EmbedBuilder()
            .setColor(user.accentColor || color)
            .setTitle(`👤 ${user.globalName || user.username}`)
            .setThumbnail(user.displayAvatarURL?.({ dynamic: true, size: 256 }) || null)
            .addFields(
                { name: '📛 Pseudo', value: user.username, inline: true },
                { name: '🤖 Type', value: isBot ? 'Bot' : 'Humain', inline: true },
                { name: '📅 Compte créé', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setTimestamp();
        if (member && member.joinedAt) {
            embed.addFields({ name: '🚪 Rejoint le', value: `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`, inline: true });
        }
        if (member) {
            const roles = Array.from(member.roles?.cache?.values() || [])
                .filter(r => r.name !== '@everyone')
                .sort((a, b) => b.position - a.position)
                .slice(0, 10);
            if (roles.length > 0) {
                embed.addFields({ name: `🎭 Rôles (${roles.length})`, value: roles.map(r => `<@&${r.id}>`).join(' '), inline: false });
            }
        }
        if (showId) {
            embed.addFields({ name: '🆔 ID', value: `\`${user.id}\`` });
        }
        if (config?.footer) embed.setFooter({ text: config.footer });
        return embed;
    }

    /**
     * Retourne l'URL d'avatar pour un user
     */
    getAvatarUrl(user, options = {}) {
        const size = options.size || 512;
        const format = options.format || 'png';
        return user.displayAvatarURL?.({ dynamic: true, size, format }) || null;
    }
}

module.exports = { InfoService };
