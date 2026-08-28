/**
 * economy.module.js — point d'entrée de la feature Économie & Inventaire (Phase 9)
 */

const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');

const defaults = require('./config/defaults.js');
const { EconomyRepository } = require('./services/economy.repository.js');
const { EconomyService } = require('./services/economy.service.js');
const { ShopService } = require('./services/shop.service.js');
const { InventoryService } = require('./services/inventory.service.js');
const { DropReactionListener } = require('./events/drop-reaction-listener.js');
const { DropCron } = require('./events/drop-cron.js');
const { EconomyController } = require('./controllers/economy.controller.js');
const {
    EconomyCommands, ShopCommands, InventoryCommands, DropButtonHandler,
    AdminEconomyCommands, AdminShopCommands, AdminInventaireCommands
} = require('./commands/economy-commands.js');

featureRegistry.define('economy', {
    defaults,
    onEnable: async (guildId) => console.log(`💰 [economy] enabled on ${guildId}`),
    onDisable: async (guildId) => console.log(`💤 [economy] disabled on ${guildId}`)
});

class EconomyModule {
    constructor(shop, inventory) {
        this.shop = shop;
        this.inventory = inventory;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const { container } = require('../../core/index.js');
            const client = container.has('Client') ? container.resolve('Client') : null;
            if (client) {
                this.shop.setClient(client);
                this.inventory.setClient(client);
            }
        } catch (err) {
            console.warn('[EconomyModule] Erreur initialisation Client:', err.message);
        }
        this._initialized = true;
    }
}

Module({
    providers: [
        EconomyRepository,
        EconomyService,
        ShopService,
        InventoryService,
        EconomyModule
    ],
    controllers: [EconomyController],
    events: [DropReactionListener, DropCron],
    commands: [
        EconomyCommands, ShopCommands, InventoryCommands, DropButtonHandler,
        AdminEconomyCommands, AdminShopCommands, AdminInventaireCommands
    ]
})(EconomyModule);

module.exports = { EconomyModule };
