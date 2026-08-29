/**
 * announcer.service.js — envoi quotidien des anniversaires
 *
 * Cron @ 09:00 Europe/Paris par défaut.
 *   1. Charge la config du guild
 *   2. Liste les anniversaires du jour (filtrés par visibilité)
 *   3. Pour chaque user : calcule l'âge, génère le template,
 *      envoie l'embed dans le salon configuré
 *   4. Distribue les cadeaux (rôle +xp)
 *   5. Log dans birthday_history
 */

const { Cron } = require('../../../core/index.js');
const { EmbedBuilder } = require('discord.js');
const { BirthdayService } = require('./birthday.service.js');
const { GiftService } = require('./gift.service.js');

class BirthdayAnnouncer {
    static inject = [BirthdayService, GiftService];

    constructor(birthday, gifts) {
        this.birthday = birthday;
        this.gifts = gifts;
        this._client = null;
    }

    setClient(client) {
        this._client = client;
        this.gifts.setClient(client);
    }

    /**
     * Annonce les anniversaires du jour pour un guild donné
     */
    async announceGuild(guildId) {
        const settings = await this.birthday.getSettings(guildId);
        if (!settings.enabled) return { announced: [], errors: [] };

        if (!this._client) return { announced: [], errors: [{ error: 'no_client' }] };

        const guild = await this._client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return { announced: [], errors: [{ error: 'guild_not_found', guildId }] };

        const channelId = settings.announceChannelId;
        const channel = channelId
            ? await guild.channels.fetch(channelId).catch(() => null)
            : null;
        if (!channel || !channel.isTextBased()) {
            return { announced: [], errors: [{ error: 'no_channel', guildId }] };
        }

        const todays = await this.birthday.listToday(guildId);
        const announced = [];
        const errors = [];

        for (const u of todays) {
            try {
                const user = await this._client.users.fetch(u.userId).catch(() => null);
                if (!user) continue;

                const age = this.birthday.ageAt(u.birthdate, new Date());
                const giftsResult = await this.gifts.give({ guild, user, config: settings });
                const giftsText = this.gifts.formatGifts(giftsResult.given);

                const content = this.birthday.renderTemplate(settings.messageTemplate, {
                    userId: user.id,
                    username: user.username,
                    age,
                    roleId: settings.pingRoleId,
                    gifts: giftsText
                });

                const embed = new EmbedBuilder()
                    .setColor(0xf2c7ce)
                    .setTitle('🎂 Anniversaire')
                    .setDescription(content)
                    .setThumbnail(user.displayAvatarURL?.({ dynamic: true }) || null)
                    .setTimestamp();

                let pingText = '';
                if (settings.pingRoleId) pingText = `<@&${settings.pingRoleId}>`;

                const sent = await channel.send({ content: pingText || null, embeds: [embed] });

                await this.birthday.recordAnnouncement({
                    guildId,
                    userId: user.id,
                    username: user.username,
                    age,
                    messageId: sent.id,
                    giftsGiven: giftsResult.given
                });

                announced.push({ userId: user.id, age, gifts: giftsResult.given });
            } catch (err) {
                errors.push({ userId: u.userId, error: err.message });
            }
        }

        return { announced, errors };
    }

    /**
     * Cron tick : parcourt tous les guilds du bot et annonce
     */
    async tick() {
        if (!this._client) return;
        try {
            for (const guild of this._client.guilds.cache.values()) {
                try {
                    await this.announceGuild(guild.id);
                } catch (err) {
                    console.error(`[BirthdayAnnouncer] guild ${guild.id} failed: ${err.message}`);
                }
            }
        } catch (err) {
            console.error(`[BirthdayAnnouncer] tick failed: ${err.message}`);
        }
    }

    /**
     * Retire les rôles temporaires des anniversaires d'hier
     * (appelé à 00:00 par le cron)
     */
    async cleanupTempRoles(guildId) {
        if (!this._client) return { removed: 0 };
        const guild = await this._client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return { removed: 0 };

        const settings = await this.birthday.getSettings(guildId);
        if (!settings.enabled || !settings.tempRoleId) return { removed: 0 };

        // Récupère les entrées d'hier avec un role_id en gifts
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const startOfDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).getTime();
        const endOfDay = startOfDay + 86400_000;
        const history = await this.birthday.listHistory({ guildId, limit: 100 });
        const yesterdays = history.filter(h => h.announcedAt >= startOfDay && h.announcedAt < endOfDay);

        let removed = 0;
        for (const h of yesterdays) {
            if ((h.giftsGiven || []).includes('role')) {
                const ok = await this.gifts.removeTempRole(guild, h.userId, settings.tempRoleId);
                if (ok) removed++;
            }
        }
        return { removed };
    }
}

Cron('0 9 * * *', { timezone: 'Europe/Paris' })(BirthdayAnnouncer.prototype, 'tick');
Cron('0 0 * * *', { timezone: 'Europe/Paris' })(BirthdayAnnouncer.prototype, 'cleanupAllTempRoles');

BirthdayAnnouncer.prototype.cleanupAllTempRoles = async function() {
    if (!this._client) return;
    for (const guild of this._client.guilds.cache.values()) {
        try {
            await this.cleanupTempRoles(guild.id);
        } catch (err) {
            console.warn(`[BirthdayAnnouncer] Erreur nettoyage rôles temporaires pour la guilde ${guild.id}:`, err.message);
        }
    }
};

module.exports = { BirthdayAnnouncer };
