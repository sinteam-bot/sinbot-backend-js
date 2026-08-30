/**
 * src/modules/util_forms/services/forms.repository.js
 *
 * Couche BDD pour la persistance des formulaires et réponses.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class FormsRepository {
    async createForm({ guildId, name, title, description, channelId, questions }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO forms (id, guild_id, name, title, description, channel_id, questions_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, guildId, name.toLowerCase().trim(), title, description || null, channelId, JSON.stringify(questions || []), now, now]
        );

        return this.getFormById(id);
    }

    async getFormById(id) {
        const res = await db.pool.query(`SELECT * FROM forms WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapForm(res.rows[0]) : null;
    }

    async getFormByName(guildId, name) {
        const res = await db.pool.query(
            `SELECT * FROM forms WHERE guild_id = $1 AND name = $2 LIMIT 1`,
            [guildId, name.toLowerCase().trim()]
        );
        return res.rows?.[0] ? this._mapForm(res.rows[0]) : null;
    }

    async listForms(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM forms WHERE guild_id = $1 ORDER BY created_at DESC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapForm(r));
    }

    async deleteForm(id) {
        await db.pool.query(`DELETE FROM form_submissions WHERE form_id = $1`, [id]);
        await db.pool.query(`DELETE FROM forms WHERE id = $1`, [id]);
    }

    async submitForm({ formId, guildId, userId, answers }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO form_submissions (id, form_id, guild_id, user_id, answers_json, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, formId, guildId, userId, JSON.stringify(answers || {}), now]
        );

        return { id, formId, guildId, userId, answers, createdAt: now };
    }

    async listSubmissions(formId) {
        const res = await db.pool.query(
            `SELECT * FROM form_submissions WHERE form_id = $1 ORDER BY created_at DESC`,
            [formId]
        );
        return (res.rows || []).map(r => ({
            id: r.id,
            formId: r.form_id,
            guildId: r.guild_id,
            userId: r.user_id,
            answers: typeof r.answers_json === 'string' ? JSON.parse(r.answers_json) : (r.answers_json || {}),
            createdAt: Number(r.created_at || 0)
        }));
    }

    _mapForm(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            name: row.name,
            title: row.title,
            description: row.description,
            channelId: row.channel_id,
            questions: typeof row.questions_json === 'string' ? JSON.parse(row.questions_json) : (row.questions_json || []),
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { FormsRepository };
