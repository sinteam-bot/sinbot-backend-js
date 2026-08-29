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
        const { db, schema } = require('../../../db/index.js');
        const { and, eq, desc } = require('drizzle-orm');
        try {
            const rows = await db.select()
                .from(schema.welcomeCards)
                .where(and(
                    eq(schema.welcomeCards.guildId, guildId),
                    eq(schema.welcomeCards.userId, userId),
                    eq(schema.welcomeCards.template, template)
                ))
                .orderBy(desc(schema.welcomeCards.createdAt))
                .limit(1);

            const row = rows?.[0];
            if (!row) return null;
            if (row.expiresAt && row.expiresAt < Date.now()) return null;
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
        const { db, schema } = require('../../../db/index.js');
        const now = Date.now();
        const id = newId();
        try {
            await db.insert(schema.welcomeCards)
                .values({
                    id,
                    guildId,
                    userId,
                    template,
                    payload: hash,
                    svg,
                    createdAt: now,
                    expiresAt: now + CACHE_TTL_MS
                });
        } catch (err) {
            console.error(`[WelcomeCardService] persist failed: ${err.message}`);
        }
    }

    async clearCache({ guildId, userId, template } = {}) {
        const { db, schema } = require('../../../db/index.js');
        const { and, eq } = require('drizzle-orm');
        const conditions = [];
        if (guildId) conditions.push(eq(schema.welcomeCards.guildId, guildId));
        if (userId) conditions.push(eq(schema.welcomeCards.userId, userId));
        if (template) conditions.push(eq(schema.welcomeCards.template, template));

        try {
            let query = db.delete(schema.welcomeCards);
            if (conditions.length > 0) {
                query = query.where(and(...conditions));
            }
            await query;
            return { success: true };
        } catch (err) {
            console.error(`[WelcomeCardService] clearCache failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }
}

module.exports = { WelcomeCardService };
