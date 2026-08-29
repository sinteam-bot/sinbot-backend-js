/**
 * feature_daily-message/daily-message.repository.js
 *
 * Repository du module Daily Message.
 *  - `openaimessages` : opérations natives Drizzle (déjà en place)
 *  - `botVersionState` : délégué à `BotStateRepository`
 */

const { desc, sql } = require('drizzle-orm');
const { db, schema } = require('../../db/index.js');
const { Repository } = require('../../core/index.js');
const { openaimessages } = require('../../db/schemas/shared/openai.js');
const { BotStateRepository } = require('../../db/schemas/shared/bot-state.repository.js');

class DailyMessageRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
        this._botState = new BotStateRepository();
    }

    // --- Drizzle natif : openaimessages ---
    async saveAiMessage(data) {
        const [saved] = await this.db.insert(openaimessages)
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
                target: openaimessages.msgid,
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
            .from(openaimessages)
            .orderBy(desc(openaimessages.id))
            .limit(limit);
    }

    // --- Bot state (last published date, etc.) ---
    async getLastPublishedDate() {
        return this._botState.getBotState('last_published_daily_date');
    }

    async setLastPublishedDate(dateStr) {
        return this._botState.setBotState('last_published_daily_date', dateStr);
    }

    async getBotState(key) {
        return this._botState.getBotState(key);
    }

    async setBotState(key, value) {
        return this._botState.setBotState(key, value);
    }
}

Repository()(DailyMessageRepository);

module.exports = { DailyMessageRepository };
