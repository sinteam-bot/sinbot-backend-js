const { Module } = require('../../core/index.js');
const { CaptchaRepository } = require('./captcha.repository.js');
const { CaptchaService } = require('./captcha.service.js');
const { CaptchaController } = require('./captcha.controller.js');
const { CaptchaEvent } = require('./captcha.event.js');
const { CaptchaCommand } = require('./captcha.cmd.js');

class CaptchaModule {}

Module({
    providers: [
        CaptchaRepository,
        CaptchaService
    ],
    controllers: [
        CaptchaController
    ],
    events: [
        CaptchaEvent
    ],
    commands: [
        CaptchaCommand
    ],
    exports: [
        CaptchaService
    ]
})(CaptchaModule);

module.exports = {
    CaptchaModule
};
