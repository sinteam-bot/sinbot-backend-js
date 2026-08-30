/**
 * src/modules/index.js
 *
 * Modules du bot, regroupés par catégorie (cf. docs/audit/draftbot-feature-list.md) :
 *   - game_         : Jeux & événements (counter, countdown, giveaways, etc.)
 *   - security_     : Sécurité (automod, logs, captcha)
 *   - community_    : Communauté (tickets, reports, reaction-roles, etc.)
 *   - welcome_      : Accueil des membres (welcome messages, cards)
 *   - engagement_   : Engagement (XP, economy, birthdays)
 *   - util_         : Utilitaires (info, invites)
 *   - notifier_     : Notifications internes (startup)
 *   - service_      : Services internes (bump-reminder)
 *
 * Chaque module peut être désactivé globalement via data/base.config.yml
 * (cf. loadAppModules() et isFeatureGloballyEnabled()).
 */

const { RoadToInfiniteModule } = require('./game_road-to-infinite/road-to-infinite.module.js');
const { CountDownModule } = require('./game_count-down/count-down.module.js');
const { CaptchaModule } = require('./security_captcha/captcha.module.js');
const { StartupNotifierModule } = require('./util_startup/startup-notifier.module.js');
const { BumpReminderModule } = require('./util_bump-reminder/bump-reminder.module.js');
const { XPLevelModule } = require('./engagement_xp-level/xp-level.module.js');
const { DailyMessageModule } = require('./community_daily-message/daily-message.module.js');
const { WelcomeModule } = require('./welcome_welcome/welcome.module.js');
const { AutoModModule } = require('./security_automod/automod.module.js');
const { TicketsModule } = require('./community_tickets/tickets.module.js');
const { LogsModule } = require('./security_logs/logs.module.js');
const { CardsModule } = require('./welcome_cards/cards.module.js');
const { GiveawaysModule } = require('./util_giveaways/giveaways.module.js');
const { PollsModule } = require('./util_polls/polls.module.js');
const { BirthdaysModule } = require('./engagement_birthdays/birthdays.module.js');
const { ReactionRolesModule } = require('./community_reaction-roles/reaction-roles.module.js');
const { ReportsModule } = require('./community_reports/reports.module.js');
const { TempVoiceModule } = require('./util_temp-voice/temp-voice.module.js');
const { EconomyModule } = require('./engagement_economy/economy.module.js');
const { StickyRolesModule } = require('./community_sticky-roles/sticky-roles.module.js');
const { InfoModule } = require('./util_info/info.module.js');
const { InvitesModule } = require('./util_invites/invites.module.js');
const { RemindersModule } = require('./util_reminders/reminders.module.js');
const { WordTriggersModule } = require('./util_word_triggers/word-triggers.module.js');
const { CustomCommandsModule } = require('./util_custom_commands/custom-commands.module.js');
const { StarboardModule } = require('./community_starboard/starboard.module.js');
const { SuggestionsModule } = require('./community_suggestions/suggestions.module.js');

const { declareExistingFeatures } = require('./feature-declarations.js');
declareExistingFeatures();

/**
 * Mapping entre un module et le nom court de la feature dans la config
 * (cf. section `features:` de data/base.config.yml).
 *
 * Si une feature est absente de ce mapping, elle est TOUJOURS activée
 * (fail-open : on ne bloque pas un module inconnu de la config).
 */
const MODULE_FEATURE_MAP = {
    [RoadToInfiniteModule.name]: 'counter',
    [CountDownModule.name]: 'countdown',
    [CaptchaModule.name]: 'captcha',
    [StartupNotifierModule.name]: 'startup_notifier',
    [BumpReminderModule.name]: 'bump_reminder',
    [XPLevelModule.name]: 'xp',
    [DailyMessageModule.name]: 'daily_message',
    [WelcomeModule.name]: 'welcome',
    [AutoModModule.name]: 'automod',
    [TicketsModule.name]: 'tickets',
    [LogsModule.name]: 'logs',
    [CardsModule.name]: 'cards',
    [GiveawaysModule.name]: 'giveaways',
    [PollsModule.name]: 'polls',
    [BirthdaysModule.name]: 'birthdays',
    [ReactionRolesModule.name]: 'reaction-roles',
    [ReportsModule.name]: 'reports',
    [TempVoiceModule.name]: 'temp_voice',
    [EconomyModule.name]: 'economy',
    [StickyRolesModule.name]: 'sticky_roles',
    [InfoModule.name]: 'info',
    [InvitesModule.name]: 'invites',
    [RemindersModule.name]: 'reminders',
    [WordTriggersModule.name]: 'word_triggers',
    [CustomCommandsModule.name]: 'custom_commands',
    [StarboardModule.name]: 'starboard',
    [SuggestionsModule.name]: 'suggestions'
};

const ALL_MODULES = [
    RoadToInfiniteModule,
    CountDownModule,
    CaptchaModule,
    StartupNotifierModule,
    BumpReminderModule,
    XPLevelModule,
    DailyMessageModule,
    WelcomeModule,
    AutoModModule,
    TicketsModule,
    LogsModule,
    CardsModule,
    GiveawaysModule,
    PollsModule,
    BirthdaysModule,
    ReactionRolesModule,
    EconomyModule,
    StickyRolesModule,
    InfoModule,
    ReportsModule,
    TempVoiceModule,
    InvitesModule,
    RemindersModule,
    WordTriggersModule,
    CustomCommandsModule,
    StarboardModule,
    SuggestionsModule
];

/**
 * Charge la liste des modules activés selon data/base.config.yml.
 * Si `features.<name>: false`, le module correspondant n'est PAS inclus
 * dans la liste retournée. Cela désactive API, commandes, events, listeners.
 *
 * Fail-open : si la config ne peut pas être chargée (erreur c12, fichier
 * manquant, etc.), TOUS les modules sont chargés pour ne pas casser le bot.
 */
async function loadAppModules() {
    const { isFeatureGloballyEnabled } = require('../config/c12-loader.js');
    const enabled = [];
    const disabled = [];

    for (const Module of ALL_MODULES) {
        const featureName = MODULE_FEATURE_MAP[Module.name];
        if (!featureName) {
            enabled.push(Module);
            continue;
        }
        const isEnabled = await isFeatureGloballyEnabled(featureName);
        if (isEnabled) {
            enabled.push(Module);
        } else {
            disabled.push({ name: Module.name, feature: featureName });
        }
    }

    if (disabled.length > 0) {
        console.log(`🚫 [modules] ${disabled.length} module(s) désactivé(s) via features.* dans data/base.config.yml :`);
        for (const d of disabled) {
            console.log(`   - ${d.name} (feature: ${d.feature})`);
        }
    }

    return enabled;
}

// Pour la rétrocompatibilité, on garde `appModules` qui contient TOUS les
// modules. Le filtrage par `loadAppModules()` est optionnel : si l'appelant
// ne fait pas le filtrage, le bot charge tout (comportement legacy).
const appModules = ALL_MODULES;

module.exports = {
    ALL_MODULES,
    MODULE_FEATURE_MAP,
    loadAppModules,
    appModules,
    RoadToInfiniteModule,
    CountDownModule,
    CaptchaModule,
    StartupNotifierModule,
    BumpReminderModule,
    XPLevelModule,
    DailyMessageModule,
    WelcomeModule,
    AutoModModule,
    TicketsModule,
    LogsModule,
    CardsModule,
    GiveawaysModule,
    PollsModule,
    BirthdaysModule,
    ReactionRolesModule,
    EconomyModule,
    StickyRolesModule,
    InfoModule,
    ReportsModule,
    TempVoiceModule,
    InvitesModule,
    RemindersModule,
    WordTriggersModule,
    CustomCommandsModule
};
