/**
 * cards.module.js — point d'entrée de la feature Cards (Phase 6)
 *
 * Cette feature est volontairement partagée (welcome + level + giveaway).
 * Elle n'a pas de "feature toggle" propre : elle s'active dès que la
 * feature `welcome` est activée (pour join/leave) ou qu'une autre
 * feature la déclenche explicitement (level_up, giveaway).
 */

const { Module } = require('../../core/index.js');
const { CardRendererService } = require('./services/card-renderer.service.js');
const { WelcomeCardService } = require('./services/welcome-card.service.js');
const { CardsController } = require('./controllers/cards.controller.js');
const { CardEventListeners } = require('./events/card-listeners.js');

class CardsModule {}

Module({
    providers: [
        CardRendererService,
        WelcomeCardService
    ],
    controllers: [CardsController],
    events: [CardEventListeners]
})(CardsModule);

module.exports = { CardsModule };
