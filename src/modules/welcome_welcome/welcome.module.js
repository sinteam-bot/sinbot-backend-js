const { Module } = require('../../core/index.js');
const { WelcomeService } = require('./welcome.service.js');
const { WelcomeController } = require('./welcome.controller.js');
const { WelcomeEvent } = require('./welcome.event.js');
const { RulesScreeningListener } = require('./events/rules-screening.listener.js');

class WelcomeModule {}

Module({
    providers: [
        WelcomeService
    ],
    controllers: [
        WelcomeController
    ],
    events: [
        WelcomeEvent,
        RulesScreeningListener
    ],
    exports: [
        WelcomeService
    ]
})(WelcomeModule);

module.exports = {
    WelcomeModule
};
