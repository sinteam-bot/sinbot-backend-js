const { Module } = require('../../core/index.js');
const { CountDownRepository } = require('./count-down.repository.js');
const { CountDownService } = require('./count-down.service.js');
const { CountDownController } = require('./count-down.controller.js');
const { CountDownEvent } = require('./count-down.event.js');
const { CountDownCommand } = require('./count-down.cmd.js');

class CountDownModule {}

Module({
    providers: [
        CountDownRepository,
        CountDownService
    ],
    controllers: [
        CountDownController
    ],
    events: [
        CountDownEvent
    ],
    commands: [
        CountDownCommand
    ],
    exports: [
        CountDownService
    ]
})(CountDownModule);

module.exports = {
    CountDownModule
};
