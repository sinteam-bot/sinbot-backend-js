/**
 * feature_daily-message/daily-message.repository.js
 *
 * Repository du module Daily Message. Réexporte les fonctions bot-state
 * (getBotState / setBotState) depuis le bridge. Les opérations
 * openaimessages sont gérées nativement par Drizzle dans ce repository
 * (cf. implémentation existante).
 */

const { eq, and, desc, sql } = require('drizzle-orm');
const { db, schema } = require('../../db/index.js');
const { Repository } = require('../../core/index.js');
const { botState } = require('../../db/legacy-bridge.js');

class DailyMessageRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
        this._state = botState;
    }

    // --- Drizzle natif : openaimessages ---
    async saveAiMessage(data) {
        const [saved] = await this.db.insert(this.schema.openaimessages)
            .values({
                msgid: data.msgid || `msg_${Date.now()}`,
                prompt: data.prompt,
                instruction: data.instruction || null,
                model: data.model || 'gpt-4o-mini',
                tokeninput: parseInt(data.tokeninput, 10) || 0,
                tokenoutput: parseInt(data.tokenoutput, 10) || 0,
                content: data.content,
                previousmsgid: data.previousMsgId || data.previousmsgid || null,
                createdAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
                target: this.schema.openaimessages.msgid,
                set: {
                    prompt: data.prompt,
                    instruction: data.instruction || null,
                    model: data.model || 'gpt-4o-mini',
                    tokeninput: parseInt(data.tokeninput, 10) || 0,
                    tokenoutput: parseInt(data.tokenoutput, 10) || 0,
                    content: data.content,
                    previousmsgid: data.previousMsgId || data.previousmsgid || null,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                }
            })
            .returning();
        return saved;
    }

    async getAiMessages(type = null, limit = 20) {
        return await this.db.select()
            .from(this.schema.openaimessages)
            .orderBy(desc(this.schema.openaimessages.id))
            .limit(limit);
    }

    // --- Bridge : bot state (last published date, etc.) ---
    async getLastPublishedDate() {
        return this._state.getBotState('last_published_daily_date');
    }

    async setLastPublishedDate(dateStr) {
        return this._state.setBotState('last_published_daily_date', dateStr);
    }

    async getBotState(key) {
        return this._state.getBotState(key);
    }

    async setBotState(key, value) {
        return this._state.setBotState(key, value);
    }
}

Repository()(DailyMessageRepository);

module.exports = { DailyMessageRepository };
