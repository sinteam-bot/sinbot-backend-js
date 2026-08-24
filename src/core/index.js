const { Container, container } = require('./container.js');
const { DiscordEventBus, eventBus } = require('./event-bus.js');
const { ModuleManager, moduleManager } = require('./module-manager.js');
const decorators = require('./decorators.js');

module.exports = {
    Container,
    container,
    DiscordEventBus,
    eventBus,
    ModuleManager,
    moduleManager,
    ...decorators
};
