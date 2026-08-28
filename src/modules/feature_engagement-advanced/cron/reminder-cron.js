/**
 * reminder-cron.js — @Cron('* * * * *', Europe/Paris)
 * Scanne les rappels到期 et les dispatch via ReminderService.
 */

const { Cron } = require('../../../core/index.js');
const { ReminderService } = require('../services/reminder.service.js');

class ReminderCron {
    static inject = [ReminderService];

    constructor(service) {
        this.service = service;
        this._client = null;
    }

    setClient(client) { this._client = client; }

    async tick() {
        try {
            const due = await this.service.tick();
            for (const r of due) {
                await this.service.dispatch(r, this._client);
            }
        } catch (err) {
            console.error(`[ReminderCron] tick failed: ${err.message}`);
        }
    }
}

Cron('* * * * *', { timezone: 'Europe/Paris' })(ReminderCron.prototype, 'tick');

module.exports = { ReminderCron };
