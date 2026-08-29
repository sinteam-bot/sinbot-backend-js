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
