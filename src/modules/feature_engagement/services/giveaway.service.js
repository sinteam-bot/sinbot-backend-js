/**
 * giveaway.service.js — logique métier des giveaways
 *
 *   - create() : crée un giveaway en BDD
 *   - enter() / leave() : ajouter/retirer une entrée
 *   - draw() : tirer N gagnants au sort (CSPRNG via crypto.randomInt)
 *   - end() : finaliser un giveaway (status = ended, set winners)
 *   - cancel() : annuler
 *   - buildEmbed() : génère l'embed initial
 *   - updateEmbed() : régénère l'embed avec le nombre d'entrées
 */

const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');

function newId() {
    return crypto.randomUUID();
}

const STATUS = { ACTIVE: 'active', ENDED: 'ended', CANCELLED: 'cancelled' };

class GiveawayService {
    static inject = [];

    constructor() {
        this.repo = null;
    }

    setRepo(repo) { this.repo = repo; }

    /**
     * Crée un giveaway
     */
    async create({ guildId, channelId, hostId, prize, description, winnersCount, requiredRoleId, durationMs, color }) {
        if (!guildId || !channelId || !hostId || !prize) {
            throw new Error('guildId, channelId, hostId et prize requis');
        }
        const now = Date.now();
        const g = {
            id: newId(),
            guildId,
            channelId,
            hostId,
            prize,
            description: description || null,
            winnersCount: winnersCount || 1,
            requiredRoleId: requiredRoleId || null,
            startsAt: now,
            endsAt: now + (durationMs || 3600_000),
            status: STATUS.ACTIVE,
            winners: [],
            color: color || null,
            createdAt: now,
            updatedAt: now
        };
        await this.repo.insertGiveaway(g);
        return g;
    }

    async get(id) { return this.repo.findGiveawayById(id); }
    async getByMessage(messageId) { return this.repo.findGiveawayByMessageId(messageId); }
    async getByChannel(channelId) { return this.repo.findGiveawayByChannelId(channelId); }

    async list(args) { return this.repo.listGiveaways(args); }
    async findDue(limit = 50) { return this.repo.findDueGiveaways(limit); }

    async setMessageId(id, messageId) {
        await this.repo.updateGiveaway(id, { messageId, updatedAt: Date.now() });
    }

    async enter(id, userId) {
        const g = await this.repo.findGiveawayById(id);
        if (!g) return { ok: false, reason: 'not_found' };
        if (g.status !== STATUS.ACTIVE) return { ok: false, reason: 'not_active' };
        if (g.endsAt < Date.now()) return { ok: false, reason: 'ended' };
        if (g.requiredRoleId) {
            return { ok: false, reason: 'role_required' };
        }
        const added = await this.repo.addEntry(id, userId);
        if (!added) return { ok: false, reason: 'already_entered' };
        return { ok: true };
    }

    async leave(id, userId) {
        const removed = await this.repo.removeEntry(id, userId);
        return { ok: removed > 0 };
    }

    async hasEntered(id, userId) {
        const entries = await this.repo.listEntries(id);
        return entries.some(e => e.user_id === userId);
    }

    async countEntries(id) {
        return this.repo.countEntries(id);
    }

    async listEntries(id) {
        const rows = await this.repo.listEntries(id);
        return rows.map(r => r.user_id);
    }

    /**
     * Tirage au sort CSPRNG
     * @returns {Promise<{winners: string[], pool: number}>}
     */
    async draw(id) {
        const g = await this.repo.findGiveawayById(id);
        if (!g) return { winners: [], pool: 0 };
        const entries = await this.repo.listEntries(id);
        const pool = entries.length;
        if (pool === 0) return { winners: [], pool: 0 };

        const count = Math.min(g.winnersCount, pool);
        const shuffled = entries.map(e => e.user_id);

        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = crypto.randomInt(0, i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return { winners: shuffled.slice(0, count), pool };
    }

    /**
     * Termine le giveaway : tire les gagnants, marque ended
     */
    async end(id) {
        const g = await this.repo.findGiveawayById(id);
        if (!g) return null;
        if (g.status !== STATUS.ACTIVE) return g;

        const { winners, pool } = await this.draw(id);
        const updated = {
            status: STATUS.ENDED,
            winners,
            updatedAt: Date.now()
        };
        await this.repo.updateGiveaway(id, updated);
        return { ...g, ...updated, pool };
    }

    async cancel(id) {
        const g = await this.repo.findGiveawayById(id);
        if (!g) return null;
        await this.repo.updateGiveaway(id, {
            status: STATUS.CANCELLED,
            updatedAt: Date.now()
        });
        return { ...g, status: STATUS.CANCELLED };
    }

    /**
     * Construit l'embed initial d'annonce
     */
    buildEmbed(g, options = {}) {
        const colorInt = parseInt((g.color || options.color || '#5865F2').replace('#', ''), 16) || 0x5865F2;
        const endsAtUnix = Math.floor(g.endsAt / 1000);
        const embed = new EmbedBuilder()
            .setColor(colorInt)
            .setTitle('🎉 GIVEAWAY')
            .setDescription(`**${g.prize}**\n\n${g.description || 'Réagis avec 🎉 pour participer !'}`)
            .addFields(
                { name: '🏆 Gagnants', value: `${g.winnersCount}`, inline: true },
                { name: '⏰ Fin', value: `<t:${endsAtUnix}:R>`, inline: true },
                { name: '👥 Participants', value: '0', inline: true }
            )
            .setFooter({ text: `Organisé par <@${g.hostId}>` })
            .setTimestamp();
        return embed;
    }

    /**
     * Régénère l'embed avec le nombre de participants actuel
     */
    async buildUpdatedEmbed(g, entriesCount) {
        const embed = this.buildEmbed(g);
        const fields = embed.data.fields || [];
        const participantsField = fields.find(f => f.name === '👥 Participants');
        if (participantsField) participantsField.value = String(entriesCount);
        if (g.status === STATUS.ENDED) {
            const winners = (g.winners || []);
            const winnersText = winners.length
                ? winners.map(id => `<@${id}>`).join(', ')
                : '_(aucun participant)_';
            embed.setDescription(`**${g.prize}**\n\n🏆 Gagnant(s) : ${winnersText}`);
            embed.setColor(0x57f287);
        } else if (g.status === STATUS.CANCELLED) {
            embed.setDescription(`**${g.prize}**\n\n❌ Giveaway annulé.`);
            embed.setColor(0x80848e);
        }
        return embed;
    }
}

Injectable()(GiveawayService);

module.exports = { GiveawayService, STATUS };
