const { RoadToInfiniteModule } = require('./game_road-to-infinite/road-to-infinite.module.js');
const { CountDownModule } = require('./game_count-down/count-down.module.js');
const { SecurityQuestionModule } = require('./security_question/security-question.module.js');
const { StartupNotifierModule } = require('./notifier_startup/startup-notifier.module.js');
const { BumpReminderModule } = require('./service_bump-reminder/bump-reminder.module.js');
const { XPLevelModule } = require('./feature_xp-level/xp-level.module.js');
const { DailyMessageModule } = require('./feature_daily-message/daily-message.module.js');
const { WelcomeModule } = require('./feature_welcome/welcome.module.js');

const appModules = [
    RoadToInfiniteModule,
    CountDownModule,
    SecurityQuestionModule,
    StartupNotifierModule,
    BumpReminderModule,
    XPLevelModule,
    DailyMessageModule,
    WelcomeModule
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
    WelcomeModule
};
