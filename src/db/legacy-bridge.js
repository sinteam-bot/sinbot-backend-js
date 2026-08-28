/**
 * src/db/legacy-bridge.js
 *
 * Pont de compatibilité : réexporte les fonctions legacy de `src/database.js`
 * groupées par module destinataire, pour permettre aux modules d'importer
 * directement depuis leur propre namespace.
 *
 * Étape 2 (strangler-fig) : ce fichier ne fait QUE réexporter les fonctions
 * déjà définies dans `database.js`. Aucune logique n'est dupliquée.
 *
 * Étape 4 : les fonctions seront portées en Drizzle natif dans chaque
 * repository de module, et ce bridge deviendra un simple barrel pointant
 * vers les nouveaux repositories (rétrocompatibilité des call-sites externes).
 *
 * Mapping :
 *   - audit       → logUserEvent, getUserEvents, saveFormResponse, getGlobalStats,
 *                   archiveDiscordEvent, getDiscordEventsArchive
 *   - xp-level    → calculateXPForLevel, calculateLevel, getOrCreateUserXP,
 *                   addXP, addMessageXP, startVoiceSession, endVoiceSession,
 *                   getUserXPInfo, getLeaderboard, getUserRank,
 *                   createEvent, addEventParticipant
 *   - birthdays   → setBirthday, getBirthday, deleteBirthday,
 *                   getTodayBirthdays, getUpcomingBirthdays
 *   - members     → registerNewMember, logMemberEvent, updateMemberRoles,
 *                   markMemberLeft, getMemberInfo, getRecentMembers,
 *                   getMemberHistory, addGuildMember
 *   - welcome     → getWelcomeConfig, saveWelcomeConfig
 *   - openai      → saveOpenAIMessage, getLastOpenAIMessageId
 *   - commands    → addGrognement, getMemberForGrognement
 *   - captcha     → createCaptcha, getUserCaptcha, verifyCaptchaAnswer,
 *                   expireCaptcha, isUserVerified, deleteCaptcha,
 *                   saveCaptchaConfig, getCaptchaConfig
 *   - bump-reminder → saveBump, getPendingBumpReminders, markBumpReminderSent,
 *                     getLastBump
 *   - dumpDiscord → saveDumpUser, saveDumpChannel, saveDumpThread,
 *                   saveDumpMessagesBatch
 *   - games       → getCounterState, updateCounterState,
 *                   getCountdownState, updateCountdownState,
 *                   addCountdownScore, getCountdownScores, resetCountdownScores
 *   - bot-state   → getBotState, setBotState
 *   - discord-cache → upsertDiscordChannel, deleteDiscordChannel,
 *                     upsertDiscordRole, deleteDiscordRole,
 *                     upsertDiscordThread, deleteDiscordThread,
 *                     updateDiscordMessage, deleteDiscordMessage
 */

const legacy = require('./legacy-bridge-impl.js');

// Réexport direct de la connexion pour les services qui utilisent `pool`
// directement (ex. discordCacheService). Sera remplacé par injection via
// container en étape 4.
const { pool } = legacy;

const audit = {
    logUserEvent: legacy.logUserEvent,
    getUserEvents: legacy.getUserEvents,
    saveFormResponse: legacy.saveFormResponse,
    getGlobalStats: legacy.getGlobalStats,
    archiveDiscordEvent: legacy.archiveDiscordEvent,
    getDiscordEventsArchive: legacy.getDiscordEventsArchive
};

const xpLevel = {
    calculateXPForLevel: legacy.calculateXPForLevel,
    calculateLevel: legacy.calculateLevel,
    getOrCreateUserXP: legacy.getOrCreateUserXP,
    addXP: legacy.addXP,
    addMessageXP: legacy.addMessageXP,
    startVoiceSession: legacy.startVoiceSession,
    endVoiceSession: legacy.endVoiceSession,
    getUserXPInfo: legacy.getUserXPInfo,
    getLeaderboard: legacy.getLeaderboard,
    getUserRank: legacy.getUserRank,
    createEvent: legacy.createEvent,
    addEventParticipant: legacy.addEventParticipant
};

const birthdays = {
    setBirthday: legacy.setBirthday,
    getBirthday: legacy.getBirthday,
    deleteBirthday: legacy.deleteBirthday,
    getTodayBirthdays: legacy.getTodayBirthdays,
    getUpcomingBirthdays: legacy.getUpcomingBirthdays
};

const members = {
    registerNewMember: legacy.registerNewMember,
    logMemberEvent: legacy.logMemberEvent,
    updateMemberRoles: legacy.updateMemberRoles,
    markMemberLeft: legacy.markMemberLeft,
    getMemberInfo: legacy.getMemberInfo,
    getRecentMembers: legacy.getRecentMembers,
    getMemberHistory: legacy.getMemberHistory,
    addGuildMember: legacy.addGuildMember
};

const welcome = {
    getWelcomeConfig: legacy.getWelcomeConfig,
    saveWelcomeConfig: legacy.saveWelcomeConfig
};

const openai = {
    saveOpenAIMessage: legacy.saveOpenAIMessage,
    getLastOpenAIMessageId: legacy.getLastOpenAIMessageId
};

const commands = {
    addGrognement: legacy.addGrognement,
    getMemberForGrognement: legacy.getMemberForGrognement
};

const captcha = {
    createCaptcha: legacy.createCaptcha,
    getUserCaptcha: legacy.getUserCaptcha,
    verifyCaptchaAnswer: legacy.verifyCaptchaAnswer,
    expireCaptcha: legacy.expireCaptcha,
    isUserVerified: legacy.isUserVerified,
    deleteCaptcha: legacy.deleteCaptcha,
    saveCaptchaConfig: legacy.saveCaptchaConfig,
    getCaptchaConfig: legacy.getCaptchaConfig
};

const bumpReminder = {
    saveBump: legacy.saveBump,
    getPendingBumpReminders: legacy.getPendingBumpReminders,
    markBumpReminderSent: legacy.markBumpReminderSent,
    getLastBump: legacy.getLastBump
};

const dumpDiscord = {
    saveDumpUser: legacy.saveDumpUser,
    saveDumpChannel: legacy.saveDumpChannel,
    saveDumpThread: legacy.saveDumpThread,
    saveDumpMessagesBatch: legacy.saveDumpMessagesBatch
};

const games = {
    getCounterState: legacy.getCounterState,
    updateCounterState: legacy.updateCounterState,
    getCountdownState: legacy.getCountdownState,
    updateCountdownState: legacy.updateCountdownState,
    addCountdownScore: legacy.addCountdownScore,
    getCountdownScores: legacy.getCountdownScores,
    resetCountdownScores: legacy.resetCountdownScores
};

const botState = {
    getBotState: legacy.getBotState,
    setBotState: legacy.setBotState
};

const discordCache = {
    upsertDiscordChannel: legacy.upsertDiscordChannel,
    deleteDiscordChannel: legacy.deleteDiscordChannel,
    upsertDiscordRole: legacy.upsertDiscordRole,
    deleteDiscordRole: legacy.deleteDiscordRole,
    upsertDiscordThread: legacy.upsertDiscordThread,
    deleteDiscordThread: legacy.deleteDiscordThread,
    updateDiscordMessage: legacy.updateDiscordMessage,
    deleteDiscordMessage: legacy.deleteDiscordMessage
};

module.exports = {
    audit,
    xpLevel,
    birthdays,
    members,
    welcome,
    openai,
    commands,
    captcha,
    bumpReminder,
    dumpDiscord,
    games,
    botState,
    discordCache,
    pool,
    legacy
};
