/**
 * EngagementCron — service avec @Cron pour end() les giveaways到期
 * et close() les polls到期 toutes les minutes
 *
 * Le ModuleManager._bindCronTasks lit les décorateurs @Cron
 * pour programmer ces handlers avec node-cron.
 */

const { Cron, getConfig } = require('../../../core/index.js');
const { GiveawayService } = require('../services/giveaway.service.js');
const { PollService } = require('../services/poll.service.js');

class EngagementCron {
    static inject = [GiveawayService, PollService];

    constructor(giveaway, poll) {
        this.giveaway = giveaway;
        this.poll = poll;
        this.client = null;
    }

    /**
     * Appelé par le ModuleManager au moment où le client Discord
     * est prêt. On le stocke pour pouvoir éditer les messages.
     */
    attachClient(client) {
        this.client = client;
    }

    async tick() {
        try {
            await this._processGiveaways();
            await this._processPolls();
        } catch (err) {
            console.error(`[EngagementCron] tick failed: ${err.message}`);
        }
    }

    async _processGiveaways() {
        const due = await this.giveaway.findDue(50);
        for (const g of due) {
            try {
                const ended = await this.giveaway.end(g.id);
                if (ended) {
                    await this._announceGiveawayEnd(ended);
                }
            } catch (err) {
                console.error(`[EngagementCron] end giveaway ${g.id} failed: ${err.message}`);
            }
        }
    }

    async _processPolls() {
        if (!this.client) return;
        const cfg = getConfig();
        const enabled = cfg.features?.engagement?.enabled || cfg.engagement?.enabled;
        if (enabled === false) return;
        const all = await this.poll.list({ status: 'active', limit: 100 });
        const now = Date.now();
        for (const p of all) {
            if (p.endsAt && p.endsAt <= now) {
                try {
                    await this.poll.end(p.id);
                    await this._announcePollEnd(p);
                } catch (err) {
                    console.error(`[EngagementCron] end poll ${p.id} failed: ${err.message}`);
                }
            }
        }
    }

    async _announceGiveawayEnd(g) {
        if (!this.client) return;
        try {
            const guild = await this.client.guilds.fetch(g.guildId).catch(() => null);
            if (!guild) return;
            const channel = await guild.channels.fetch(g.channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return;
            const msg = g.winners && g.winners.length
                ? `🎉 Giveaway terminé ! **${g.prize}** remporté par : ${g.winners.map(id => `<@${id}>`).join(', ')}`
                : `🎉 Giveaway terminé ! **${g.prize}** — aucun participant.`;
            await channel.send({ content: msg }).catch(err => {
                console.warn('[EngagementCron] Échec envoi message fin giveaway:', err.message);
            });

            if (g.messageId && (g.winners || []).length) {
                try {
                    const original = await channel.messages.fetch(g.messageId).catch(() => null);
                    if (original) {
                        const updatedEmbed = await this.giveaway.buildUpdatedEmbed(g, await this.giveaway.countEntries(g.id));
                        await original.edit({ embeds: [updatedEmbed] }).catch(err => {
                            console.warn('[EngagementCron] Échec mise à jour embed giveaway:', err.message);
                        });
                    }
                } catch (err) {
                    console.warn('[EngagementCron] Erreur mise à jour message giveaway:', err.message);
                }
            }
        } catch (err) {
            console.error(`[EngagementCron] announce giveaway ${g.id} failed: ${err.message}`);
        }
    }

    async _announcePollEnd(p) {
        if (!this.client) return;
        try {
            const guild = await this.client.guilds.fetch(p.guildId).catch(() => null);
            if (!guild) return;
            const channel = await guild.channels.fetch(p.channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return;
            if (p.messageId) {
                const original = await channel.messages.fetch(p.messageId).catch(() => null);
                if (original) {
                    const embed = await this.poll.buildEmbed(p);
                    await original.edit({ embeds: [embed], components: [] }).catch(err => {
                        console.warn('[EngagementCron] Échec mise à jour embed sondage terminé:', err.message);
                    });
                }
            }
        } catch (err) {
            console.error(`[EngagementCron] announce poll ${p.id} failed: ${err.message}`);
        }
    }
}

Cron('* * * * *', { timezone: 'Europe/Paris' })(EngagementCron.prototype, 'tick');

module.exports = { EngagementCron };
