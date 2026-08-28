/* eslint-disable no-console */
/**
 * scripts/generate-module-repositories.js
 *
 * Script de génération des repositories par module (étape 2 du plan
 * docs/plan/db-repository-split.md). Crée pour chaque module listé :
 *   - <module>/db/schema.js     : stub qui pointe vers le schema global
 *   - <module>/<x>.repository.js : repository qui réexporte le bridge
 *
 * Idempotent : réexécutable, n'écrase pas un repository custom existant.
 * À supprimer après la fin de l'étape 4.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(ROOT, 'src', 'modules');

const MODULES = [
    { name: 'feature_xp-level', file: 'xp-level.repository', bridge: 'xpLevel', tables: ['userXp', 'xpTransactions', 'voiceSessions', 'events', 'eventParticipants'] },
    { name: 'feature_birthdays', file: 'birthdays.repository', bridge: 'birthdays', tables: ['userBirthdays', 'birthdayGuildSettings', 'birthdayVisibility', 'birthdayChangeLog', 'birthdayHistory'] },
    { name: 'feature_tickets', file: 'tickets.repository', bridge: null, tables: ['tickets', 'ticketMessages', 'ticketAttachments'] },
    { name: 'feature_economy', file: 'economy.repository', bridge: null, tables: ['userEconomy', 'economyTransactions', 'shopItems', 'userInventory', 'inventoryDrops', 'inventoryTransfers'] },
    { name: 'feature_reports', file: 'reports.repository', bridge: null, tables: ['reports', 'reportActions'] },
    { name: 'feature_reaction-roles', file: 'reaction-roles.repository', bridge: null, tables: ['reactionRoles'] },
    { name: 'feature_temp-voice', file: 'temp-voice.repository', bridge: null, tables: ['tempVoiceConfig', 'tempVoiceState'] },
    { name: 'feature_sticky-roles', file: 'sticky-roles.repository', bridge: null, tables: ['stickyRoles'] },
    { name: 'feature_engagement', file: 'engagement.repository', bridge: null, tables: ['giveaways', 'giveawayEntries', 'polls', 'pollVotes', 'reminders', 'wordTriggers', 'customCommands'] },
    { name: 'feature_automod', file: 'automod.repository', bridge: null, tables: ['userWarnings', 'userSanctions', 'modLogs'] },
    { name: 'feature_welcome', file: 'welcome.repository', bridge: 'welcome', tables: ['welcomeConfig', 'welcomeCards', 'roleAssignLogs'] },
    { name: 'feature_info', file: 'info.repository', bridge: 'botState', tables: ['botConfig', 'botState', 'authSessions', 'authAuditLogs', 'authFailedAttempts', 'userProfiles'] },
    { name: 'service_bump-reminder', file: 'bump-reminder.repository', bridge: 'bumpReminder', tables: ['bumpLogs'] },
    { name: 'feature_logs', file: 'logs.repository', bridge: null, tables: [] },
    { name: 'notifier_startup', file: 'startup.repository', bridge: 'botState', tables: [] },
    { name: 'security_question', file: 'security-question.repository', bridge: 'captcha', tables: ['userCaptchas', 'captchaLogs', 'captchaConfig'] },
    { name: 'game_count-down', file: 'count-down.repository', bridge: 'games', tables: ['countdownState', 'countdownScores'] },
    { name: 'game_road-to-infinite', file: 'road-to-infinite.repository', bridge: 'games', tables: ['counterState'] },
    { name: 'feature_daily-message', file: 'daily-message.repository', bridge: 'botState', tables: [] }
];

function writeFile(filePath, content) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(filePath)) {
        console.log(`  [skip] ${path.relative(ROOT, filePath)} (existe déjà)`);
        return false;
    }
    fs.writeFileSync(filePath, content);
    console.log(`  [create] ${path.relative(ROOT, filePath)}`);
    return true;
}

function schemaTemplate({ tables }) {
    const tbl = tables.length > 0
        ? tables.map(t => `    ${t}: pgSchema.${t},`).join('\n')
        : '    // tables à identifier';
    return `/**
 * db/schema.js — Tables Drizzle propres au module.
 * Étape 2 : stub qui pointe vers le schema global (rétrocompat).
 * Étape 3 : remplacera par des définitions \`pgTable\` isolées.
 */

const pgSchema = require('../../../db/schema/pg.js');

module.exports = {
${tbl}
};
`;
}

function repositoryTemplate({ moduleName, modulePath, bridge, bridgeName, fileName }) {
    const bridgeRef = bridge ? `bridge.${bridgeName}` : '/* TODO: bridge à identifier en étape 4 */';
    return `/**
 * ${fileName}.js — Repository du module ${moduleName}.
 *
 * Étape 2 (strangler-fig) : réexporte les fonctions du bridge de
 * compatibilité \`db/legacy-bridge.js\`. Aucune logique n'est dupliquée.
 * Étape 4 : les fonctions seront portées nativement en Drizzle ici.
 *
 * Utilisation dans un service du module :
 *   const { ${bridgeName || 'TODO'} } = require('./${fileName}.js');
 *   await ${bridgeName || 'TODO'}.someMethod(...);
 */

const { Repository } = require('../../core/index.js');
const bridge = require('../../db/legacy-bridge.js');

class ${toPascalCase(fileName)} {
    constructor() {
        this.bridge = ${bridgeRef};
    }

    /**
     * Indique que ce repository est un wrapper legacy.
     * Sera supprimé en étape 4 une fois la migration Drizzle terminée.
     */
    isLegacyBridge() {
        return true;
    }
}

Repository()(this.${toPascalCase(fileName)} = ${toPascalCase(fileName)});

module.exports = { ${toPascalCase(fileName)} };
`;
}

function toPascalCase(str) {
    return str
        .split(/[-_]/)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join('') + 'Repository';
}

let created = 0;
for (const m of MODULES) {
    const moduleDir = path.join(MODULES_DIR, m.name);
    if (!fs.existsSync(moduleDir)) {
        console.warn(`  [warn] ${m.name} n'existe pas, ignoré`);
        continue;
    }

    const schemaPath = path.join(moduleDir, 'db', 'schema.js');
    const repoPath = path.join(moduleDir, `${m.file}.js`);

    if (writeFile(schemaPath, schemaTemplate(m))) created++;
    if (m.bridge) {
        if (writeFile(repoPath, repositoryTemplate({
            moduleName: m.name,
            modulePath: m.name,
            bridge: m.bridge !== 'botState' ? m.bridge : null,
            bridgeName: m.bridge,
            fileName: m.file
        }))) created++;
    } else {
        console.log(`  [note] ${m.name} : pas de bridge identifié, repository à créer manuellement en étape 4`);
    }
}

console.log(`\n${created} fichier(s) créé(s).`);
