/**
 * db/schemas/shared/openai.js
 *
 * Tables utilisées par la feature Daily Message (messages IA + contextes
 * de conversation). Transverses car accédées par le service daily-message
 * et l'API web.
 */

const { pgTable, text, integer, serial } = require('../_drizzle.js');
const { sql } = require('drizzle-orm');

const openaimessages = pgTable('openaimessages', {
    id: serial('id').primaryKey(),
    msgid: text('msgid').notNull().unique(),
    prompt: text('prompt'),
    instruction: text('instruction'),
    model: text('model'),
    tokeninput: integer('tokeninput'),
    tokenoutput: integer('tokenoutput'),
    content: text('content'),
    previousmsgid: text('previousmsgid'),
    rawdata: text('rawdata'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

module.exports = { openaimessages };
