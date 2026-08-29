/**
 * engagement.controller.js — endpoints REST pour giveaways & polls
 *
 * GiveawaysController:
 *   GET    /api/giveaways?status=active
 *   GET    /api/giveaways/:id
 *   POST   /api/giveaways          : crée un giveaway (programmatic)
 *   POST   /api/giveaways/:id/end  : force la fin
 *   POST   /api/giveaways/:id/cancel
 *   GET    /api/giveaways/:id/entries
 *
 * PollsController:
 *   GET    /api/polls?status=active
 *   GET    /api/polls/:id
 *   POST   /api/polls              : crée un poll
 *   POST   /api/polls/:id/end
 *   GET    /api/polls/:id/results
 */

const { Controller, Get, Post } = require('../../../core/index.js');
const { GiveawayService } = require('../services/giveaway.service.js');
const { PollService } = require('../services/poll.service.js');

class GiveawaysController {
    static inject = [GiveawayService];

    constructor (giveaway) {
        this.giveaway = giveaway;
    }

    async listGiveaways(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const list = await this.giveaway.list({
                guildId,
                status: req.query.status || null,
                limit: Math.min(parseInt(req.query.limit, 10) || 50, 200)
            });
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getGiveaway(req) {
        try {
            const g = await this.giveaway.get(req.params.id);
            if (!g) return { success: false, error: 'Giveaway introuvable' };
            const count = await this.giveaway.countEntries(g.id);
            return { success: true, data: { ...g, entryCount: count } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createGiveaway(req) {
        try {
            const g = await this.giveaway.create({
                guildId: req.body.guildId || process.env.GUILD_ID,
                channelId: req.body.channelId,
                hostId: req.body.hostId,
                prize: req.body.prize,
                description: req.body.description,
                winnersCount: req.body.winnersCount,
                requiredRoleId: req.body.requiredRoleId,
                durationMs: req.body.durationMs,
                color: req.body.color
            });
            return { success: true, data: g };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async endGiveaway(req) {
        try {
            const g = await this.giveaway.end(req.params.id);
            if (!g) return { success: false, error: 'Giveaway introuvable' };
            return { success: true, data: g };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async cancelGiveaway(req) {
        try {
            const g = await this.giveaway.cancel(req.params.id);
            if (!g) return { success: false, error: 'Giveaway introuvable' };
            return { success: true, data: g };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async listEntries(req) {
        try {
            const entries = await this.giveaway.listEntries(req.params.id);
            return { success: true, data: entries };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}


class PollsController {
    static inject = [PollService];

    constructor (poll) {
        this.poll = poll;
    }

    async listPolls(req) {
        try {
            const guildId = req.query.guild_id || process.env.GUILD_ID;
            const list = await this.poll.list({
                guildId,
                status: req.query.status || null,
                limit: Math.min(parseInt(req.query.limit, 10) || 50, 200)
            });
            return { success: true, data: list };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getPoll(req) {
        try {
            const p = await this.poll.get(req.params.id);
            if (!p) return { success: false, error: 'Sondage introuvable' };
            const tally = await this.poll.tally(p.id);
            return { success: true, data: { ...p, tally } };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async createPoll(req) {
        try {
            const p = await this.poll.create({
                guildId: req.body.guildId || process.env.GUILD_ID,
                channelId: req.body.channelId,
                question: req.body.question,
                options: req.body.options,
                multiChoice: req.body.multiChoice,
                anonymous: req.body.anonymous,
                durationMs: req.body.durationMs,
                createdBy: req.body.createdBy
            });
            return { success: true, data: p };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async endPoll(req) {
        try {
            const p = await this.poll.end(req.params.id);
            if (!p) return { success: false, error: 'Sondage introuvable' };
            return { success: true, data: p };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async pollResults(req) {
        try {
            const tally = await this.poll.tally(req.params.id);
            return { success: true, data: tally };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

Controller('/api/giveaways')(GiveawaysController);
Get('/')(GiveawaysController.prototype, 'listGiveaways');
Get('/:id')(GiveawaysController.prototype, 'getGiveaway');
Post('/')(GiveawaysController.prototype, 'createGiveaway');
Post('/:id/end')(GiveawaysController.prototype, 'endGiveaway');
Post('/:id/cancel')(GiveawaysController.prototype, 'cancelGiveaway');
Get('/:id/entries')(GiveawaysController.prototype, 'listEntries');
Controller('/api/polls')(PollsController);
Get('/')(PollsController.prototype, 'listPolls');
Get('/:id')(PollsController.prototype, 'getPoll');
Post('/')(PollsController.prototype, 'createPoll');
Post('/:id/end')(PollsController.prototype, 'endPoll');
Get('/:id/results')(PollsController.prototype, 'pollResults');

module.exports = {
    GiveawaysController,
    PollsController,
    EngagementController: GiveawaysController
};
