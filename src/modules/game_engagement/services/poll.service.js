/**
 * poll.service.js — logique métier des sondages
 *
 *   - create() : crée un poll en BDD
 *   - vote() / unvote() : voter / retirer un vote
 *   - toggle() : basculer (utile pour multi_choice)
 *   - tally() : compte les votes par option
 *   - end() : termine le poll
 *   - buildEmbed() : génère l'embed avec barres de progression
 */

const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');

function newId() {
    return crypto.randomUUID();
}

const STATUS = { ACTIVE: 'active', ENDED: 'ended' };

class PollService {
    static inject = [];

    constructor() {
        this.repo = null;
    }

    setRepo(repo) { this.repo = repo; }

    /**
     * Crée un poll
     */
    async create({ guildId, channelId, question, options, multiChoice, anonymous, durationMs, createdBy }) {
        if (!guildId || !channelId || !question || !Array.isArray(options)) {
            throw new Error('guildId, channelId, question, options requis');
        }
        if (options.length < 2) throw new Error('Au moins 2 options requises');
        if (options.length > 10) throw new Error('Maximum 10 options');

        const now = Date.now();
        const p = {
            id: newId(),
            guildId,
            channelId,
            question,
            options: options.slice(0, 10).map(o => String(o).slice(0, 80)),
            multiChoice: !!multiChoice,
            anonymous: !!anonymous,
            endsAt: durationMs ? now + durationMs : null,
            status: STATUS.ACTIVE,
            createdBy,
            createdAt: now
        };
        await this.repo.insertPoll(p);
        return p;
    }

    async get(id) { return this.repo.findPollById(id); }
    async getByMessage(messageId) { return this.repo.findPollByMessageId(messageId); }
    async list(args) { return this.repo.listPolls(args); }

    async setMessageId(id, messageId) {
        await this.repo.updatePoll(id, { messageId });
    }

    async end(id) {
        const p = await this.repo.findPollById(id);
        if (!p) return null;
        if (p.status !== STATUS.ACTIVE) return p;
        await this.repo.updatePoll(id, { status: STATUS.ENDED });
        return { ...p, status: STATUS.ENDED };
    }

    /**
     * Vote pour une option (ou bascule si multi_choice)
     */
    async vote(pollId, userId, optionIndex) {
        const p = await this.repo.findPollById(pollId);
        if (!p) return { ok: false, reason: 'not_found' };
        if (p.status !== STATUS.ACTIVE) return { ok: false, reason: 'not_active' };
        if (p.endsAt && p.endsAt < Date.now()) return { ok: false, reason: 'ended' };
        if (optionIndex < 0 || optionIndex >= p.options.length) {
            return { ok: false, reason: 'invalid_option' };
        }

        if (p.multiChoice) {
            // Mode bascule : si déjà voté, on retire
            const existing = await this.repo.getUserVotes(pollId, userId);
            if (existing.includes(optionIndex)) {
                await this.repo.removeVotesForUser(pollId, userId); // remove all + re-add except this
                // Re-add the other votes
                for (const idx of existing) {
                    if (idx !== optionIndex) {
                        await this.repo.addVote(pollId, userId, idx);
                    }
                }
                return { ok: true, action: 'removed' };
            } else {
                await this.repo.addVote(pollId, userId, optionIndex);
                return { ok: true, action: 'added' };
            }
        } else {
            // Single choice : remplace
            await this.repo.removeVotesForUser(pollId, userId);
            await this.repo.addVote(pollId, userId, optionIndex);
            return { ok: true, action: 'replaced' };
        }
    }

    async unvote(pollId, userId) {
        const removed = await this.repo.removeVotesForUser(pollId, userId);
        return { ok: removed > 0 };
    }

    async tally(pollId) {
        const p = await this.repo.findPollById(pollId);
        if (!p) return { total: 0, perOption: [] };
        const rows = await this.repo.tallyVotes(pollId);
        const perOption = p.options.map((label, idx) => {
            const row = rows.find(r => r.option_index === idx);
            return { index: idx, label, count: row?.count || 0 };
        });
        const total = perOption.reduce((s, o) => s + o.count, 0);
        return { total, perOption };
    }

    /**
     * Construit l'embed du poll avec barres de progression
     */
    async buildEmbed(p, { showResults = true, voter = null } = {}) {
        const { total, perOption } = await this.tally(p.id);
        const lines = perOption.map(opt => {
            const pct = total > 0 ? Math.round((opt.count / total) * 100) : 0;
            const bar = '▰'.repeat(Math.round(pct / 10)) + '▱'.repeat(10 - Math.round(pct / 10));
            return `**${opt.index + 1}.** ${opt.label}\n${bar} **${opt.count}** (${pct}%)`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📊 ' + p.question)
            .setDescription(lines.join('\n\n') || '_(pas encore de votes)_')
            .setFooter({ text: p.multiChoice ? 'Choix multiple' : 'Choix unique' })
            .setTimestamp(p.createdAt);

        if (p.endsAt && p.status === STATUS.ACTIVE) {
            embed.addFields({ name: '⏰ Clôture', value: `<t:${Math.floor(p.endsAt / 1000)}:R>`, inline: true });
        }
        if (p.status === STATUS.ENDED) {
            embed.addFields({ name: '📊 Statut', value: 'Clôturé', inline: true });
            embed.setColor(0x80848e);
        } else if (total > 0) {
            embed.addFields({ name: '👥 Votes', value: String(total), inline: true });
        }
        if (!p.anonymous && voter) {
            const myVotes = await this.repo.getUserVotes(p.id, voter);
            if (myVotes.length) {
                embed.addFields({ name: '✅ Ton vote', value: myVotes.map(i => `${i + 1}. ${p.options[i]}`).join(' / '), inline: false });
            }
        }
        return embed;
    }
}

Injectable()(PollService);

module.exports = { PollService, STATUS };
