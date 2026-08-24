const { Module } = require('../../core/index.js');
const { BumpReminderRepository } = require('./bump-reminder.repository.js');
const { BumpReminderService } = require('./bump-reminder.service.js');
const { BumpReminderController } = require('./bump-reminder.controller.js');
const { BumpReminderEvent } = require('./bump-reminder.event.js');
const { BumpReminderCommand } = require('./bump-reminder.cmd.js');

class BumpReminderModule {}

Module({
    providers: [
        BumpReminderRepository,
        BumpReminderService
    ],
    controllers: [
        BumpReminderController
    ],
    events: [
        BumpReminderEvent
    ],
    commands: [
        BumpReminderCommand
    ],
    exports: [
        BumpReminderService
    ]
})(BumpReminderModule);

module.exports = {
    BumpReminderModule
};
