const { Module } = require('../../core/index.js');
const { XPLevelRepository } = require('./xp-level.repository.js');
const { XPLevelService } = require('./xp-level.service.js');
const { XPLevelController } = require('./xp-level.controller.js');
const { XPLevelEvent } = require('./xp-level.event.js');
const { XPLevelCommand } = require('./xp-level.cmd.js');

class XPLevelModule {}

Module({
    providers: [
        XPLevelRepository,
        XPLevelService
    ],
    controllers: [
        XPLevelController
    ],
    events: [
        XPLevelEvent
    ],
    commands: [
        XPLevelCommand
    ],
    exports: [
        XPLevelService
    ]
})(XPLevelModule);

module.exports = {
    XPLevelModule
};
