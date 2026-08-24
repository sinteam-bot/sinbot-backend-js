const { Module } = require('../../core/index.js');
const { WelcomeService } = require('./welcome.service.js');
const { WelcomeController } = require('./welcome.controller.js');
const { WelcomeEvent } = require('./welcome.event.js');

class WelcomeModule {}

Module({
    providers: [
        WelcomeService
    ],
    controllers: [
        WelcomeController
    ],
    events: [
        WelcomeEvent
    ],
    exports: [
        WelcomeService
    ]
})(WelcomeModule);

module.exports = {
    WelcomeModule
};
