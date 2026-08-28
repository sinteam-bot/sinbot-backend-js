/**
 * db/schemas/shared/openai.repository.js
 *
 * Repository transverse pour les opérations OpenAI / OpenRouter
 * (table `openaimessages` définie dans `openai.js`).
 *
 * Le code est porté nativement depuis `src/db/legacy-bridge-impl.js`.
 */

const { desc, sql } = require('drizzle-orm');
const { Repository } = require('../../../core/index.js');
const { db, schema } = require('../../index.js');
const { openaimessages } = require('./openai.js');

class OpenAIRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    async saveOpenAIMessage(data) {
        try {
            const [saved] = await this.db.insert(openaimessages)
                .values({
                    msgid: data.msgid,
                    prompt: data.prompt,
                    instruction: data.instruction || null,
                    model: data.model || 'unknow',
                    tokeninput: parseInt(data.tokeninput, 10) || 0,
                    tokenoutput: parseInt(data.tokenoutput, 10) || 0,
                    content: data.content,
                    previousmsgid: data.previousMsgId || null,
                    rawdata: data.rawData ? JSON.stringify(data.rawData) : null,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: openaimessages.msgid,
                    set: {
                        prompt: data.prompt,
                        instruction: data.instruction || null,
                        model: data.model || 'unknow',
                        tokeninput: parseInt(data.tokeninput, 10) || 0,
                        tokenoutput: parseInt(data.tokenoutput, 10) || 0,
                        content: data.content,
                        previousmsgid: data.previousMsgId || null,
                        rawdata: data.rawData ? JSON.stringify(data.rawData) : null,
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                })
                .returning();

            return saved;
        } catch (error) {
            console.error('❌ Erreur saveOpenAIMessage:', error);
            throw error;
        }
    }

    async getLastOpenAIMessageId() {
        try {
            const [latest] = await this.db.select({ msgid: openaimessages.msgid })
                .from(openaimessages)
                .orderBy(desc(openaimessages.id))
                .limit(1);

            return latest ? latest.msgid : null;
        } catch (error) {
            console.error('❌ Erreur getLastOpenAIMessageId:', error);
            throw error;
        }
    }
}

Repository()(OpenAIRepository);

module.exports = { OpenAIRepository };
