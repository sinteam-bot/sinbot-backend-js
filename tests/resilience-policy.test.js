const assert = require('node:assert');
const { ResiliencePolicy } = require('../src/utils/resiliencePolicy.js');

describe('ResiliencePolicy (Polly-like) Tests', () => {

    test('should execute action successfully without retries if no error occurs', async () => {
        const policy = ResiliencePolicy.handleAll().waitAndRetryAsync({ maxRetries: 3 });
        let calls = 0;
        const result = await policy.executeAsync(async () => {
            calls++;
            return 'success';
        });

        assert.strictEqual(result, 'success');
        assert.strictEqual(calls, 1);
    });

    test('should retry on transient error up to maxRetries and then succeed', async () => {
        const retryLog = [];
        const policy = ResiliencePolicy.handleStatusCodes([429, 503])
            .waitAndRetryAsync({
                maxRetries: 2,
                initialDelayMs: 10,
                backoffFactor: 1.5,
                jitter: false,
                onRetry: (err, attempt, delay) => {
                    retryLog.push({ attempt, delay, status: err.status });
                }
            });

        let calls = 0;
        const result = await policy.executeAsync(async () => {
            calls++;
            if (calls <= 2) {
                const err = new Error('Rate limit exceeded');
                err.status = 429;
                throw err;
            }
            return 'recovered';
        });

        assert.strictEqual(result, 'recovered');
        assert.strictEqual(calls, 3);
        assert.strictEqual(retryLog.length, 2);
        assert.strictEqual(retryLog[0].attempt, 1);
        assert.strictEqual(retryLog[1].attempt, 2);
    });

    test('should throw error when maxRetries are exceeded without fallback', async () => {
        const policy = ResiliencePolicy.handleAll().waitAndRetryAsync({
            maxRetries: 2,
            initialDelayMs: 5,
            jitter: false
        });

        let calls = 0;
        await assert.rejects(
            async () => {
                await policy.executeAsync(async () => {
                    calls++;
                    throw new Error('Fatal service down');
                });
            },
            { message: 'Fatal service down' }
        );

        assert.strictEqual(calls, 3); // initial + 2 retries
    });

    test('should invoke fallbackHandler when all retries fail', async () => {
        const policy = ResiliencePolicy.handleAll()
            .waitAndRetryAsync({ maxRetries: 1, initialDelayMs: 5, jitter: false })
            .fallbackAsync(async (error, context) => {
                return { fallback: true, originalError: error.message };
            });

        const result = await policy.executeAsync(async () => {
            throw new Error('Provider timeout');
        });

        assert.strictEqual(result.fallback, true);
        assert.strictEqual(result.originalError, 'Provider timeout');
    });

    test('should respect timeoutAsync per attempt', async () => {
        const policy = ResiliencePolicy.handleAll()
            .timeoutAsync(50)
            .waitAndRetryAsync({ maxRetries: 1, initialDelayMs: 5, jitter: false });

        let calls = 0;
        await assert.rejects(
            async () => {
                await policy.executeAsync(async () => {
                    calls++;
                    await new Promise(resolve => setTimeout(resolve, 200));
                    return 'too late';
                });
            },
            (err) => err.isTimeout === true || err.code === 'ETIMEDOUT'
        );

        assert.strictEqual(calls, 2); // 1st attempt + 1 retry
    });
});
