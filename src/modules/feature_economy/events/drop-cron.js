/**
 * DropCron — expire les drops到期 chaque minute + cleanup transactions
 */

const { Cron } = require('../../../core/index.js');
const { InventoryService } = require('../services/inventory.service.js');
const { EconomyRepository } = require('../services/economy.repository.js');

class DropCron {
    static inject = [InventoryService, EconomyRepository];

    constructor(inventory, repo) {
        this.inventory = inventory;
        this.repo = repo;
    }

    async tick() {
        try {
            const r = await this.inventory.expireDueDrops();
            if (r.expired > 0) {
                console.log(`[DropCron] ${r.expired} drop(s) expiré(s)`);
            }
        } catch (err) {
            console.error(`[DropCron] tick failed: ${err.message}`);
        }
    }
}

Cron('* * * * *', { timezone: 'Europe/Paris' })(DropCron.prototype, 'tick');

module.exports = { DropCron };
