/**
 * GiveawayCron — service avec @Cron pour end() les giveaways到期
 * et close() les polls到期 toutes les minutes
 *
 * Le ModuleManager._bindCronTasks lit les décorateurs @Cron
 * pour programmer ces handlers avec node-cron.
 */

const { Cron } = require('../../../core/index.js');
const { GiveawayService } = require('../services/giveaway.service.js');
const { PollService } = require('../../util_polls/services/poll.service.js');

class GiveawayCron {
    static inject = [GiveawayService, PollService];

    constructor(giveawayService, pollService) {
        this.giveawayService = giveawayService;
        this.pollService = pollService;
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
        await this._processGiveaways();
        await this._processPolls();
    }

    async _processGiveaways() {
        const due = await this.giveawayService.findDue(50);
        for (const g of due) {
            try {
                const ended = await this.giveawayService.end(g.id);
                if (ended) {
                    await this._announceGiveawayEnd(ended);
                }
            } catch (err) {
                console.error(`[GiveawayCron] end giveaway ${g.id} failed: ${err.message}`);
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
                console.warn('[GiveawayCron] Échec envoi message fin giveaway:', err.message);
            });

            if (g.messageId && (g.winners || []).length) {
                try {
                    const original = await channel.messages.fetch(g.messageId).catch(() => null);
                    if (original) {
                        const updatedEmbed = await this.giveawayService.buildUpdatedEmbed(g, await this.giveawayService.countEntries(g.id));
                        await original.edit({ embeds: [updatedEmbed] }).catch(err => {
                            console.warn('[GiveawayCron] Échec mise à jour embed giveaway:', err.message);
                        });
                    }
                } catch (err) {
                    console.warn('[GiveawayCron] Erreur mise à jour message giveaway:', err.message);
                }
            }
        } catch (err) {
            console.error(`[GiveawayCron] announce giveaway ${g.id} failed: ${err.message}`);
        }
    }

    async _processPolls() {
        const due = await this.pollService.findDue(50);
        for (const p of due) {
            try {
                const closed = await this.pollService.end(p.id);
                if (closed) {
                    await this._announcePollEnd(closed);
                }
            } catch (err) {
                console.error(`[GiveawayCron] end poll ${p.id} failed: ${err.message}`);
            }
        }
    }

    async _announcePollEnd(p) {
        if (!this.client) return;
        try {
            const guild = await this.client.guilds.fetch(p.guildId).catch(() => null);
            if (!guild) return;
            const channel = await guild.channels.fetch(p.channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return;
            const tally = await this.pollService.tally(p.id);
            const lines = (p.options || []).map((opt, i) => {
                const count = tally[i] || 0;
                return `${i + 1}. ${opt} — **${count}** vote(s)`;
            });
            const msg = `📊 Sondage terminé : **${p.question}**\n${lines.join('\n')}`;
            await channel.send({ content: msg }).catch(err => {
                console.warn('[GiveawayCron] Échec envoi message fin poll:', err.message);
            });
        } catch (err) {
            console.error(`[GiveawayCron] announce poll ${p.id} failed: ${err.message}`);
        }
    }
}

Cron('* * * * *', { timezone: 'Europe/Paris' })(GiveawayCron.prototype, 'tick');

module.exports = { GiveawayCron };
