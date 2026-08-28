const assert = require('node:assert');
const { test, describe, beforeAll, afterAll, beforeEach } = require("vitest");
const openrouter = require('../src/utils/openrouter.js');

describe('OpenRouter Utilities Tests', () => {
    test('openrouter: should export LLM helper functions', () => {
        assert.strictEqual(typeof openrouter.callChatGPT, 'function');
        assert.strictEqual(typeof openrouter.callChatGPTWithHistory, 'function');
        assert.strictEqual(typeof openrouter.client, 'object');
    });

    test('callChatGPT: processes prompt and returns formatted result using client mock', async () => {
        const originalCreate = openrouter.client.chat.completions.create;
        try {
            // Mock API response
            openrouter.client.chat.completions.create = async (payload) => {
                return {
                    id: 'mock_chat_id_123',
                    choices: [{
                        message: {
                            content: 'Bonjour ! Ceci est un test IA réussi.'
                        },
                        finish_reason: 'stop'
                    }],
                    usage: {
                        prompt_tokens: 15,
                        completion_tokens: 25,
                        total_tokens: 40
                    },
                    model: payload.model
                };
            };

            const response = await openrouter.callChatGPT('Bonjour', {
                systemPrompt: 'Tu es un bot assistant.',
                model: 'nvidia/nemotron-3.5-lightning:free'
            });

            assert.strictEqual(response.text, 'Bonjour ! Ceci est un test IA réussi.');
            assert.strictEqual(response.usage.promptTokens, 15);
            assert.strictEqual(response.usage.completionTokens, 25);
            assert.strictEqual(response.model, 'nvidia/nemotron-3.5-lightning:free');

        } finally {
            openrouter.client.chat.completions.create = originalCreate;
        }
    });

    test('callChatGPTWithHistory: sends full context messages array', async () => {
        const originalCreate = openrouter.client.chat.completions.create;
        try {
            let receivedMessages = [];
            openrouter.client.chat.completions.create = async (payload) => {
                receivedMessages = payload.messages;
                return {
                    id: 'mock_history_id',
                    choices: [{
                        message: { content: 'Réponse avec historique.' },
                        finish_reason: 'stop'
                    }],
                    usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 }
                };
            };

            const history = [
                { role: 'user', content: 'Message 1' },
                { role: 'assistant', content: 'Réponse 1' }
            ];

            const response = await openrouter.callChatGPTWithHistory(history, 'Comment vas-tu ?', {
                systemPrompt: 'System instructions'
            });

            assert.strictEqual(response.text, 'Réponse avec historique.');
            assert.strictEqual(receivedMessages.length, 4);
            assert.strictEqual(receivedMessages[0].role, 'system');
            assert.strictEqual(receivedMessages[1].content, 'Message 1');
            assert.strictEqual(receivedMessages[3].content, 'Comment vas-tu ?');

        } finally {
            openrouter.client.chat.completions.create = originalCreate;
        }
    });

    test('calculateCost: computes token cost accurately based on model pricing', () => {
        const cost = openrouter.calculateCost('openai/gpt-4o-mini', 1000, 1000);
        assert.ok(typeof cost === 'number');
        assert.ok(cost > 0);
    });

    test('estimateTokens: computes token count estimate based on text length', () => {
        const est = openrouter.estimateTokens('Hello world, ceci est un test de comptage de tokens.');
        assert.ok(typeof est === 'number');
        assert.ok(est > 0);
    });
});
