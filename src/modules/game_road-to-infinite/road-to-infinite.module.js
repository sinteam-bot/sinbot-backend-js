const { Module } = require('../../core/index.js');
const { RoadToInfiniteRepository } = require('./road-to-infinite.repository.js');
const { RoadToInfiniteService } = require('./road-to-infinite.service.js');
const { RoadToInfiniteController } = require('./road-to-infinite.controller.js');
const { RoadToInfiniteEvent } = require('./road-to-infinite.event.js');
const { RoadToInfiniteCommand } = require('./road-to-infinite.cmd.js');

class RoadToInfiniteModule {}

Module({
    providers: [
        RoadToInfiniteRepository,
        RoadToInfiniteService
    ],
    controllers: [
        RoadToInfiniteController
    ],
    events: [
        RoadToInfiniteEvent
    ],
    commands: [
        RoadToInfiniteCommand
    ],
    exports: [
        RoadToInfiniteService
    ]
})(RoadToInfiniteModule);

module.exports = {
    RoadToInfiniteModule
};
