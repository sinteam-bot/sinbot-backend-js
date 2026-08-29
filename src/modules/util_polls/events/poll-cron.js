/**
 * PollCron — service avec @Cron pour end() les giveaways到期
 * et close() les polls到期 toutes les minutes
 *
 * Le ModuleManager._bindCronTasks lit les décorateurs @Cron
 * pour programmer ces handlers avec node-cron.
 */

const { Cron, getConfig } = require('../../../core/index.js');
const { GiveawayService } = require('../services/giveaway.service.js');
const { PollService } = require('../services/poll.service.js');

class PollCron {
    static inject = [PollService];

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

            } catch (err) {
                console.error(`[PollCron] end giveaway ${g.id} failed: ${err.message}`);
            }
        }
    }

    async _processPolls() {
        if (!this.client) return;
        const cfg = getConfig();
        const enabled = cfg.features?.engagement?.enabled || cfg.engagement?.enabled;
        if (enabled === false) return;
        const all = await this.service.list({ status: 'active', limit: 100 });
        const now = Date.now();
        for (const p of all) {
            if (p.endsAt && p.endsAt <= now) {
                try {
                    await this.service.end(p.id);
                    await this._announcePollEnd(p);
                } catch (err) {
                    console.error(`[PollCron] end poll ${p.id} failed: ${err.message}`);
                }
            }
        }
    }

                } catch (err) {
                    console.warn('[PollCron] Erreur mise à jour message giveaway:', err.message);
                }
            }
        } catch (err) {
            console.error(`[PollCron] announce giveaway ${g.id} failed: ${err.message}`);
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
                    const embed = await this.service.buildEmbed(p);
                    await original.edit({ embeds: [embed], components: [] }).catch(err => {
                        console.warn('[PollCron] Échec mise à jour embed sondage terminé:', err.message);
                    });
                }
            }
        } catch (err) {
            console.error(`[PollCron] announce poll ${p.id} failed: ${err.message}`);
        }
    }
}

Cron('* * * * *', { timezone: 'Europe/Paris' })(PollCron.prototype, 'tick');

module.exports = { PollCron };
