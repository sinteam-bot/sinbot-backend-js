/**
 * src/modules/util_embed_builder/services/embed-builder.repository.js
 *
 * Couche BDD pour la persistance des custom embeds.
 */

const { db } = require('../../../db/index.js');
const crypto = require('crypto');

function newId() { return crypto.randomUUID(); }

class EmbedBuilderRepository {
    async insertEmbed({ guildId, channelId, messageId, title, description, color, fields, footer, thumbnail, image, author }) {
        const id = newId();
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO custom_embeds (
                id, guild_id, channel_id, message_id, title, description, color,
                fields, footer, thumbnail, image, author, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
                id, guildId, channelId, messageId, title || null, description || null,
                color || null, JSON.stringify(fields || []), footer || null,
                thumbnail || null, image || null, JSON.stringify(author || {}), now, now
            ]
        );

        return this.getEmbedById(id);
    }

    async updateEmbed(id, { title, description, color, fields, footer, thumbnail, image, author }) {
        const now = Date.now();
        await db.pool.query(
            `UPDATE custom_embeds SET
                title = COALESCE($2, title),
                description = COALESCE($3, description),
                color = COALESCE($4, color),
                fields = COALESCE($5, fields),
                footer = COALESCE($6, footer),
                thumbnail = COALESCE($7, thumbnail),
                image = COALESCE($8, image),
                author = COALESCE($9, author),
                updated_at = $10
             WHERE id = $1`,
            [
                id,
                title !== undefined ? title : null,
                description !== undefined ? description : null,
                color !== undefined ? color : null,
                fields !== undefined ? JSON.stringify(fields) : null,
                footer !== undefined ? footer : null,
                thumbnail !== undefined ? thumbnail : null,
                image !== undefined ? image : null,
                author !== undefined ? JSON.stringify(author) : null,
                now
            ]
        );

        return this.getEmbedById(id);
    }

    async getEmbedById(id) {
        const res = await db.pool.query(`SELECT * FROM custom_embeds WHERE id = $1 LIMIT 1`, [id]);
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async getEmbedByMessageId(guildId, messageId) {
        const res = await db.pool.query(
            `SELECT * FROM custom_embeds WHERE guild_id = $1 AND message_id = $2 LIMIT 1`,
            [guildId, messageId]
        );
        return res.rows?.[0] ? this._mapRow(res.rows[0]) : null;
    }

    async listByGuild(guildId) {
        const res = await db.pool.query(
            `SELECT * FROM custom_embeds WHERE guild_id = $1 ORDER BY created_at DESC`,
            [guildId]
        );
        return (res.rows || []).map(r => this._mapRow(r));
    }

    async delete(id) {
        await db.pool.query(`DELETE FROM custom_embeds WHERE id = $1`, [id]);
    }

    _mapRow(row) {
        return {
            id: row.id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            messageId: row.message_id,
            title: row.title,
            description: row.description,
            color: row.color,
            fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : (row.fields || []),
            footer: row.footer,
            thumbnail: row.thumbnail,
            image: row.image,
            author: typeof row.author === 'string' ? JSON.parse(row.author) : (row.author || {}),
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0)
        };
    }
}

module.exports = { EmbedBuilderRepository };
