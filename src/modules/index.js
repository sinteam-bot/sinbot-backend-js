const { RoadToInfiniteModule } = require('./game_road-to-infinite/road-to-infinite.module.js');
const { CountDownModule } = require('./game_count-down/count-down.module.js');
const { SecurityQuestionModule } = require('./security_question/security-question.module.js');
const { StartupNotifierModule } = require('./notifier_startup/startup-notifier.module.js');
const { BumpReminderModule } = require('./service_bump-reminder/bump-reminder.module.js');
const { XPLevelModule } = require('./feature_xp-level/xp-level.module.js');
const { DailyMessageModule } = require('./feature_daily-message/daily-message.module.js');
const { WelcomeModule } = require('./feature_welcome/welcome.module.js');
const { AutoModModule } = require('./feature_automod/automod.module.js');
const { TicketsModule } = require('./feature_tickets/tickets.module.js');
const { LogsModule } = require('./feature_logs/logs.module.js');
const { CardsModule } = require('./feature_cards/cards.module.js');
const { EngagementModule } = require('./feature_engagement/engagement.module.js');
const { BirthdaysModule } = require('./feature_birthdays/birthdays.module.js');
const { ReactionRolesModule } = require('./feature_reaction-roles/reaction-roles.module.js');
const { EconomyModule } = require('./feature_economy/economy.module.js');

const { declareExistingFeatures } = require('./feature-declarations.js');
declareExistingFeatures();

const appModules = [
    RoadToInfiniteModule,
    CountDownModule,
    SecurityQuestionModule,
    StartupNotifierModule,
    BumpReminderModule,
    XPLevelModule,
    DailyMessageModule,
    WelcomeModule,
    AutoModModule,
    TicketsModule,
    LogsModule,
    CardsModule,
    EngagementModule,
    BirthdaysModule,
    ReactionRolesModule,
    EconomyModule
];

module.exports = {
    appModules,
    RoadToInfiniteModule,
    CountDownModule,
    SecurityQuestionModule,
    StartupNotifierModule,
    BumpReminderModule,
    XPLevelModule,
    DailyMessageModule,
    WelcomeModule,
    AutoModModule,
    TicketsModule,
    LogsModule,
    CardsModule,
    EngagementModule,
    BirthdaysModule,
    ReactionRolesModule,
    EconomyModule
};
