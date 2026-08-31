const { Module } = require('../../core/index.js');
const { featureRegistry } = require('../../core/feature-registry.js');
const { BumpReminderRepository } = require('./bump-reminder.repository.js');
const { BumpReminderService } = require('./bump-reminder.service.js');
const { BumpReminderController } = require('./bump-reminder.controller.js');
const { BumpReminderEvent } = require('./bump-reminder.event.js');
const { BumpReminderCommand } = require('./bump-reminder.cmd.js');

featureRegistry.define('bump_reminder', {
    defaults: {
        enabled: true,
        channel_id: '',
        role_id: '',
        use_embed: true,
        reminder_cooldown_hours: 2,
        mention_here: true
    },
    aliases: ['bump-reminder', 'bump_reminders', 'bump']
});

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
