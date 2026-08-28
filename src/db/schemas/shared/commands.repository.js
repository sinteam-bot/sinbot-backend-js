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
        this.addGrognement = this.addGrognement.bind(this);
        this.getMemberForGrognement = this.getMemberForGrognement.bind(this);
    }

    async addGrognement(userId, username) {
        try {
            const database = this?.db || db;
            const [grog] = await database.insert(grognement)
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
            const database = this?.db || db;
            const grogMembers = await database.select().from(grognement);
            if (grogMembers.length > 0) {
                return grogMembers[Math.floor(Math.random() * grogMembers.length)];
            }
            const guildMems = await database.select().from(guildMembers);
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

const commandsRepository = new CommandsRepository();
const addGrognement = (userId, username) => commandsRepository.addGrognement(userId, username);
const getMemberForGrognement = () => commandsRepository.getMemberForGrognement();

module.exports = {
    CommandsRepository,
    commandsRepository,
    addGrognement,
    getMemberForGrognement
};
