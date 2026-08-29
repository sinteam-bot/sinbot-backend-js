const { Module } = require('../../core/index.js');
const { DailyMessageRepository } = require('./daily-message.repository.js');
const { DailyMessageService } = require('./daily-message.service.js');
const { DailyMessageController } = require('./daily-message.controller.js');
const { DailyMessageEvent } = require('./daily-message.event.js');
const { DailyMessageCommand } = require('./daily-message.cmd.js');

class DailyMessageModule {}

Module({
    providers: [
        DailyMessageRepository,
        DailyMessageService
    ],
    controllers: [
        DailyMessageController
    ],
    events: [
        DailyMessageEvent
    ],
    commands: [
        DailyMessageCommand
    ],
    exports: [
        DailyMessageService
    ]
})(DailyMessageModule);

module.exports = {
    DailyMessageModule
};
