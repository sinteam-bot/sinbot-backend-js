/**
 * src/modules/community_starboard/events/starboard.event.js
 *
 * Événements Discord pour le module Starboard.
 */

const { OnEvent } = require('../../../core/index.js');
const { StarboardService } = require('../services/starboard.service.js');
const logger = require('../../../utils/logger.js');

class StarboardListener {
    static inject = [StarboardService];

    constructor(service) {
        this.service = service;
        this.client = null;
    }

    setClient(client) {
        this.client = client;
    }

    async onReactionAdd(reaction, user) {
        if (user.bot) return;
        const client = this.client || reaction.client;
        await this.service.handleReactionAdd(reaction, user, client);
    }

    async onReactionRemove(reaction, user) {
        if (user.bot) return;
        const client = this.client || reaction.client;
        await this.service.handleReactionRemove(reaction, user, client);
    }
}

OnEvent('messageReactionAdd')(StarboardListener.prototype, 'onReactionAdd');
OnEvent('messageReactionRemove')(StarboardListener.prototype, 'onReactionRemove');

module.exports = { StarboardListener };
