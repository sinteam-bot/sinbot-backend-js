const { eq, and, desc, sql } = require('drizzle-orm');
const { db, schema } = require('../../db/index.js');
const { Repository } = require('../../core/index.js');
const { getBotState, setBotState } = require('../../db/legacy-bridge.js').botState;

class DailyMessageRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    /**
     * Enregistre un message IA (prompt ou réponse finale)
     */
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

    /**
     * Récupère les derniers messages IA
     */
    async getAiMessages(type = null, limit = 20) {
        return await this.db.select()
            .from(this.schema.openaimessages)
            .orderBy(desc(this.schema.openaimessages.id))
            .limit(limit);
    }

    /**
     * Récupère la date de la dernière publication
     */
    async getLastPublishedDate() {
        return await getBotState('last_published_daily_date');
    }

    /**
     * Enregistre la date de publication
     */
    async setLastPublishedDate(dateStr) {
        await setBotState('last_published_daily_date', dateStr);
    }

    async getBotState(key) {
        return await getBotState(key);
    }

    async setBotState(key, value) {
        return await setBotState(key, value);
    }
}

Repository()(DailyMessageRepository);

module.exports = {
    DailyMessageRepository
};
