const { RoadToInfiniteModule } = require('./game_road-to-infinite/road-to-infinite.module.js');
const { CountDownModule } = require('./game_count-down/count-down.module.js');

const appModules = [
    RoadToInfiniteModule,
    CountDownModule
];

module.exports = {
    appModules,
    RoadToInfiniteModule,
    CountDownModule
};
