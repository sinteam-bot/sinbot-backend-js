/**
 * welcome-card.service.js — orchestration du rendu de carte
 *
 * Combine CardRendererService + cache BDD welcome_cards pour éviter
 * de re-rendre la même carte à chaque event.
 *
 * API :
 *  - render({ guildId, userId, template, payload }) -> svg
 *  - renderToBuffer(...)  -> Buffer
 *  - getCached({guildId, userId, template, payload}) -> svg | null
 *  - clearCache({guildId, userId, template}) -> rows
 */

const crypto = require('crypto');
const { CardRendererService } = require('./card-renderer.service.js');

function newId() {
    return crypto.randomUUID();
}

const CACHE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 jours

class WelcomeCardService {
    static inject = [CardRendererService];

    constructor(renderer) {
        this.renderer = renderer;
    }

    /**
     * Récupère une carte depuis le cache si la payload-hash matche
     */
    async getCached({ guildId, userId, template, payload }) {
        const hash = this.renderer.hashPayload(payload);
        const { db } = require('../../../db/index.js');
        try {
            const res = await db.pool.query(
                `SELECT * FROM welcome_cards
                 WHERE guild_id = $1 AND user_id = $2 AND template = $3
                 ORDER BY created_at DESC LIMIT 1`,
                [guildId, userId, template]
            );
            const row = res.rows?.[0];
            if (!row) return null;
            if (row.expires_at && row.expires_at < Date.now()) return null;
            if (row.payload !== hash) return null;
            return row.svg;
        } catch (err) {
            console.error(`[WelcomeCardService] getCached failed: ${err.message}`);
            return null;
        }
    }

    /**
     * Rend (ou récupère du cache) une carte
     */
    async render({ guildId, userId, template, payload = {}, options = {} }) {
        if (!this.renderer.listTemplates().includes(template)) {
            throw new Error(`Template inconnu: ${template}`);
        }

        const cached = await this.getCached({ guildId, userId, template, payload });
        if (cached) return cached;

        const svg = this.renderer.render(template, payload, options);
        const hash = this.renderer.hashPayload(payload);

        await this._persist({
            guildId, userId, template, payload, hash, svg
        });

        return svg;
    }

    async renderToBuffer(args) {
        const svg = await this.render(args);
        return Buffer.from(svg, 'utf-8');
    }

    async _persist({ guildId, userId, template, payload, hash, svg }) {
        const { db } = require('../../../db/index.js');
        const now = Date.now();
        const id = newId();
        try {
            await db.pool.query(
                `INSERT INTO welcome_cards (id, guild_id, user_id, template, payload, svg, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [id, guildId, userId, template, hash, svg, now, now + CACHE_TTL_MS]
            );
        } catch (err) {
            console.error(`[WelcomeCardService] persist failed: ${err.message}`);
        }
    }

    async clearCache({ guildId, userId, template } = {}) {
        const { db } = require('../../../db/index.js');
        const where = [];
        const args = [];
        if (guildId) { args.push(guildId); where.push(`guild_id = $${args.length}`); }
        if (userId) { args.push(userId); where.push(`user_id = $${args.length}`); }
        if (template) { args.push(template); where.push(`template = $${args.length}`); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const res = await db.pool.query(
            `DELETE FROM welcome_cards ${whereSql}`,
            args
        );
        return { deleted: res.rowCount || 0 };
    }
}

module.exports = { WelcomeCardService };
