const { Container, container } = require('./container.js');
const { DiscordEventBus, eventBus } = require('./event-bus.js');
const { ModuleManager, moduleManager } = require('./module-manager.js');
const { FeatureRegistry, featureRegistry } = require('./feature-registry.js');
const { getConfig, config } = require('../config/index.js');
const decorators = require('./decorators.js');

module.exports = {
    Container,
    container,
    DiscordEventBus,
    eventBus,
    ModuleManager,
    moduleManager,
    FeatureRegistry,
    featureRegistry,
    getConfig,
    config,
    ...decorators
};
