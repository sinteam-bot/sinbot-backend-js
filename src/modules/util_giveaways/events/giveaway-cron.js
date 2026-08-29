/**
 * GiveawayCron — service avec @Cron pour end() les giveaways到期
 * et close() les polls到期 toutes les minutes
 *
 * Le ModuleManager._bindCronTasks lit les décorateurs @Cron
 * pour programmer ces handlers avec node-cron.
 */

const { Cron, getConfig } = require('../../../core/index.js');
const { GiveawayService } = require('../services/giveaway.service.js');
const { PollService } = require('../services/poll.service.js');

class GiveawayCron {
    static inject = [GiveawayService];

    constructor(service) {
        this.service = service;
        this.client = null;
    }

    /**
     * Appelé par le ModuleManager au moment où le client Discord
     * est prêt. On le stocke pour pouvoir éditer les messages.
     */
    attachClient(client) {
        this.client = client;
    }

    }

    async _processGiveaways() {
        const due = await this.service.findDue(50);
        for (const g of due) {
            try {
                const ended = await this.service.end(g.id);
                if (ended) {
                    await this._announceGiveawayEnd(ended);
                }
            } catch (err) {
                console.error(`[GiveawayCron] end giveaway ${g.id} failed: ${err.message}`);
            }
        }
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
                console.warn('[GiveawayCron] Échec envoi message fin giveaway:', err.message);
            });

            if (g.messageId && (g.winners || []).length) {
                try {
                    const original = await channel.messages.fetch(g.messageId).catch(() => null);
                    if (original) {
                        const updatedEmbed = await this.service.buildUpdatedEmbed(g, await this.service.countEntries(g.id));
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

            }
        } catch (err) {
            console.error(`[GiveawayCron] announce poll ${p.id} failed: ${err.message}`);
        }
    }
}

Cron('* * * * *', { timezone: 'Europe/Paris' })(GiveawayCron.prototype, 'tick');

module.exports = { GiveawayCron };
