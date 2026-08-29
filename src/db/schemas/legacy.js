/**
 * db/schemas/legacy.js
 *
 * Barrel d'agrégation du schema Drizzle global. Chaque module expose son
 * propre schema dans `modules/<x>/db/schema.js`, et les tables transverses
 * vivent dans `db/schemas/shared/`. Ce fichier se contente de tout
 * réexporter pour que Drizzle reçoive un seul objet `schema`.
 *
 * Ce barrel est conservé pour la rétrocompatibilité avec les imports
 * existants (`require('../../db/schemas/legacy.js')`).
 *
 * ⚠️  Pour ajouter une table, **ne pas** la déclarer ici : aller dans
 * le `db/schema.js` du module propriétaire (ou dans `shared/` si transverse).
 */

const sharedAudit = require('./shared/audit.js');
const sharedCache = require('./shared/cache.js');
const sharedGuildSettings = require('./shared/guild-settings.js');
const sharedBotInfo = require('./shared/bot-info.js');
const sharedOpenai = require('./shared/openai.js');

const xpLevel = require('../../modules/engagement_xp-level/db/schema.js');
const birthdays = require('../../modules/engagement_birthdays/db/schema.js');
const automod = require('../../modules/security_automod/db/schema.js');
const tickets = require('../../modules/community_tickets/db/schema.js');
const welcome = require('../../modules/welcome_welcome/db/schema.js');
const economy = require('../../modules/engagement_economy/db/schema.js');
const reports = require('../../modules/community_reports/db/schema.js');
const reactionRoles = require('../../modules/community_reaction-roles/db/schema.js');
const tempVoice = require('../../modules/util_temp-voice/db/schema.js');
const stickyRoles = require('../../modules/community_sticky-roles/db/schema.js');
const engagement = require('../../modules/game_engagement/db/schema.js');
const captcha = require('../../modules/security_captcha/db/schema.js');
const bumpReminder = require('../../modules/util_bump-reminder/db/schema.js');
const countdown = require('../../modules/game_count-down/db/schema.js');
const infinite = require('../../modules/game_road-to-infinite/db/schema.js');
const info = require('../../modules/util_info/db/schema.js');
const invites = require('../../modules/util_invites/db/schema.js');

module.exports = {
    // Tables transverses (shared)
    ...sharedAudit,
    ...sharedCache,
    ...sharedGuildSettings,
    ...sharedBotInfo,
    ...sharedOpenai,

    // Tables par module
    ...xpLevel,
    ...birthdays,
    ...automod,
    ...tickets,
    ...welcome,
    ...economy,
    ...reports,
    ...reactionRoles,
    ...tempVoice,
    ...stickyRoles,
    ...engagement,
    ...captcha,
    ...bumpReminder,
    ...countdown,
    ...infinite,
    ...info,
    ...invites
};
