/**
 * db/schemas/shared/commands.repository.js
 *
 * Repository transverse pour les commandes "globales" non rattachées à un
 * module particulier (ex. confirm_member, choose_member). Utilise la
 * table `grognement` (définie dans `cache.js`) + `guild_members`.
 *
 * Le code est porté nativement depuis `src/db/legacy-bridge-impl.js`.
 */

const { sql } = require('drizzle-orm');
const { Repository } = require('../../../core/index.js');
const { db, schema } = require('../../index.js');
const { grognement, guildMembers } = require('./cache.js');

class CommandsRepository {
    constructor() {
        this.db = db;
        this.schema = schema;
    }

    async addGrognement(userId, username) {
        try {
            const [grog] = await this.db.insert(grognement)
                .values({ userId, username })
                .onConflictDoUpdate({
                    target: grognement.userId,
                    set: { username }
                })
                .returning();

            return grog;
        } catch (error) {
            console.error('❌ Erreur addGrognement:', error);
            throw error;
        }
    }

    async getMemberForGrognement() {
        try {
            const grogMembers = await this.db.select().from(grognement);
            if (grogMembers.length > 0) {
                return grogMembers[Math.floor(Math.random() * grogMembers.length)];
            }
            const guildMems = await this.db.select().from(guildMembers);
            if (guildMems.length > 0) {
                return guildMems[Math.floor(Math.random() * guildMems.length)];
            }
            return null;
        } catch (error) {
            console.error('❌ Erreur getMemberForGrognement:', error);
            throw error;
        }
    }
}

Repository()(CommandsRepository);

module.exports = { CommandsRepository };
