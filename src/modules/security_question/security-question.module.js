const { Module } = require('../../core/index.js');
const { SecurityQuestionRepository } = require('./security-question.repository.js');
const { SecurityQuestionService } = require('./security-question.service.js');
const { SecurityQuestionController } = require('./security-question.controller.js');
const { SecurityQuestionEvent } = require('./security-question.event.js');
const { SecurityQuestionCommand } = require('./security-question.cmd.js');

class SecurityQuestionModule {}

Module({
    providers: [
        SecurityQuestionRepository,
        SecurityQuestionService
    ],
    controllers: [
        SecurityQuestionController
    ],
    events: [
        SecurityQuestionEvent
    ],
    commands: [
        SecurityQuestionCommand
    ],
    exports: [
        SecurityQuestionService
    ]
})(SecurityQuestionModule);

module.exports = {
    SecurityQuestionModule
};
