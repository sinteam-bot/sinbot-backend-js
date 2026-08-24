const { Module } = require('../../core/index.js');
const { StartupNotifierService } = require('./startup-notifier.service.js');
const { StartupNotifierController } = require('./startup-notifier.controller.js');
const { StartupNotifierEvent } = require('./startup-notifier.event.js');

class StartupNotifierModule {}

Module({
    providers: [
        StartupNotifierService
    ],
    controllers: [
        StartupNotifierController
    ],
    events: [
        StartupNotifierEvent
    ],
    exports: [
        StartupNotifierService
    ]
})(StartupNotifierModule);

module.exports = {
    StartupNotifierModule
};
