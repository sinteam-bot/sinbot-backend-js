const { RoadToInfiniteModule } = require('./game_road-to-infinite/road-to-infinite.module.js');
const { CountDownModule } = require('./game_count-down/count-down.module.js');
const { SecurityQuestionModule } = require('./security_question/security-question.module.js');

const appModules = [
    RoadToInfiniteModule,
    CountDownModule,
    SecurityQuestionModule
];

module.exports = {
    appModules,
    RoadToInfiniteModule,
    CountDownModule,
    SecurityQuestionModule
};
