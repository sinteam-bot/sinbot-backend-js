/**
 * src/modules/community_suggestions/events/suggestions.event.js
 *
 * Événements Discord pour le module Suggestions (suivi des votes 👍/👎).
 */

const { OnEvent } = require('../../../core/index.js');
const { SuggestionsService } = require('../services/suggestions.service.js');

class SuggestionsListener {
    static inject = [SuggestionsService];

    constructor(service) {
        this.service = service;
        this.client = null;
    }

    setClient(client) {
        this.client = client;
    }

    async onReactionAdd(reaction, user) {
        if (user.bot) return;
        await this.service.handleReactionVote(reaction, user, true);
    }

    async onReactionRemove(reaction, user) {
        if (user.bot) return;
        await this.service.handleReactionVote(reaction, user, false);
    }
}

OnEvent('messageReactionAdd')(SuggestionsListener.prototype, 'onReactionAdd');
OnEvent('messageReactionRemove')(SuggestionsListener.prototype, 'onReactionRemove');

module.exports = { SuggestionsListener };
