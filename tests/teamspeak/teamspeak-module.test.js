const assert = require('node:assert');
const { TeamSpeakModule } = require('../../src/modules/util_teamspeak/teamspeak.module.js');
const { TeamSpeakCommands } = require('../../src/modules/util_teamspeak/commands/teamspeak.cmd.js');
const { TeamSpeakController } = require('../../src/modules/util_teamspeak/controllers/teamspeak.controller.js');
const { featureRegistry } = require('../../src/core/feature-registry.js');
const { Container } = require('../../src/core/container.js');

describe('TeamSpeakModule Structure & Wiring', () => {
    test('module has valid metadata defined via @Module', () => {
        const metadata = TeamSpeakModule.__moduleMetadata;
        assert.ok(metadata);
        assert.ok(Array.isArray(metadata.providers));
        assert.ok(Array.isArray(metadata.controllers));
        assert.ok(Array.isArray(metadata.commands));
        assert.ok(Array.isArray(metadata.events));

        assert.ok(metadata.controllers.includes(TeamSpeakController));
        assert.ok(metadata.commands.includes(TeamSpeakCommands));
    });

    test('featureRegistry defines teamspeak and its aliases', () => {
        assert.ok(featureRegistry.features.has('teamspeak'));

        const feature = featureRegistry.features.get('teamspeak');
        assert.ok(feature.defaults);
        assert.strictEqual(typeof feature.defaults.server, 'object');
        assert.strictEqual(typeof feature.defaults.widget, 'object');
        assert.strictEqual(typeof feature.defaults.logs, 'object');

        assert.strictEqual(featureRegistry._resolveName('ts3'), 'teamspeak');
        assert.strictEqual(featureRegistry._resolveName('teamspeak3'), 'teamspeak');
        assert.strictEqual(featureRegistry._resolveName('team-speak'), 'teamspeak');
    });

    test('commands class defines slash command /teamspeak', () => {
        const commands = TeamSpeakCommands.__commands;
        assert.ok(commands && commands.length > 0);
        const cmd = commands.find(c => c.name === 'teamspeak');
        assert.ok(cmd);
        assert.ok(cmd.builder);
        assert.strictEqual(cmd.builder.name, 'teamspeak');
    });

    test('can instantiate module providers via IoC container', () => {
        const testContainer = new Container();

        for (const provider of TeamSpeakModule.__moduleMetadata.providers) {
            testContainer.register(provider);
        }

        const moduleInstance = testContainer.resolve(TeamSpeakModule);
        assert.ok(moduleInstance);
        assert.ok(moduleInstance.clientService);
        assert.ok(moduleInstance.treeService);
        assert.ok(moduleInstance.widgetService);
        assert.ok(moduleInstance.logsService);
    });
});
