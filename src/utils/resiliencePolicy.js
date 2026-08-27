/**
 * Moteur de résilience et de politique de retry inspiré de Polly (.NET)
 * Supporte :
 * - Retry avec backoff exponentiel et gigue (jitter)
 * - Timeout par tentative via AbortController
 * - Filtrage par code de statut HTTP ou prédicat d'erreur personnalisé
 * - Gestion de secours (Fallback Policy)
 * - Chaînage fluide (Builder Pattern)
 */

class ResiliencePolicy {
    constructor() {
        this.errorPredicates = [];
        this.retryConfig = {
            maxRetries: 0,
            initialDelayMs: 1000,
            backoffFactor: 2.0,
            maxDelayMs: 30000,
            jitter: true,
            onRetry: null
        };
        this.timeoutMs = 0;
        this.fallbackHandler = null;
    }

    /**
     * Initialise une nouvelle politique Polly-like
     * @returns {ResiliencePolicy}
     */
    static handle(predicate) {
        const policy = new ResiliencePolicy();
        if (typeof predicate === 'function') {
            policy.errorPredicates.push(predicate);
        }
        return policy;
    }

    /**
     * Gère toutes les erreurs
     * @returns {ResiliencePolicy}
     */
    static handleAll() {
        return ResiliencePolicy.handle(() => true);
    }

    /**
     * Gère les erreurs correspondant aux codes de statuts HTTP spécifiés
     * @param {number[]} statusCodes
     * @returns {ResiliencePolicy}
     */
    static handleStatusCodes(statusCodes = [408, 429, 500, 502, 503, 504]) {
        return ResiliencePolicy.handle((error) => {
            const status = error.status || error.statusCode || error.response?.status;
            if (status && statusCodes.includes(Number(status))) {
                return true;
            }
            const code = error.code || '';
            const msg = (error.message || '').toLowerCase();
            // Erreurs réseau / socket courantes
            if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND'].includes(code)) {
                return true;
            }
            if (msg.includes('rate limit') || msg.includes('overloaded') || msg.includes('timeout') || msg.includes('temporarily unavailable')) {
                return true;
            }
            return false;
        });
    }

    /**
     * Ajoute un prédicat d'erreur supplémentaire (comme Polly .Or<T>())
     * @param {Function} predicate
     * @returns {this}
     */
    or(predicate) {
        if (typeof predicate === 'function') {
            this.errorPredicates.push(predicate);
        }
        return this;
    }

    /**
     * Configure la politique d'attente et de réessai (Wait and Retry with Exponential Backoff)
     * @param {object} options
     * @param {number} [options.maxRetries=3]
     * @param {number} [options.initialDelayMs=1000]
     * @param {number} [options.backoffFactor=2.0]
     * @param {number} [options.maxDelayMs=30000]
     * @param {boolean} [options.jitter=true]
     * @param {Function} [options.onRetry] - callback (error, attempt, delayMs, context)
     * @returns {this}
     */
    waitAndRetryAsync(options = {}) {
        this.retryConfig = {
            maxRetries: options.maxRetries !== undefined ? options.maxRetries : 3,
            initialDelayMs: options.initialDelayMs || 1000,
            backoffFactor: options.backoffFactor !== undefined ? options.backoffFactor : 2.0,
            maxDelayMs: options.maxDelayMs || 30000,
            jitter: options.jitter !== false,
            onRetry: typeof options.onRetry === 'function' ? options.onRetry : null
        };
        return this;
    }

    /**
     * Configure un timeout strict par exécution / tentative
     * @param {number} timeoutMs
     * @returns {this}
     */
    timeoutAsync(timeoutMs) {
        this.timeoutMs = Number(timeoutMs) || 0;
        return this;
    }

    /**
     * Configure une fonction de fallback si toutes les tentatives échouent
     * @param {Function} fallbackHandler - (error, context) => Promise<any>
     * @returns {this}
     */
    fallbackAsync(fallbackHandler) {
        this.fallbackHandler = typeof fallbackHandler === 'function' ? fallbackHandler : null;
        return this;
    }

    /**
     * Vérifie si l'erreur courante doit être gérée par la politique de retry
     * @param {Error} error
     * @returns {boolean}
     */
    shouldHandleError(error) {
        if (this.errorPredicates.length === 0) return true;
        return this.errorPredicates.some(predicate => {
            try {
                return Boolean(predicate(error));
            } catch {
                return false;
            }
        });
    }

    /**
     * Calcule le délai de pause avec backoff exponentiel et gigue (Jitter Polly)
     * @param {number} attempt - Numéro de la tentative actuelle (1-indexed)
     * @returns {number} Délai en millisecondes
     */
    calculateDelay(attempt) {
        const { initialDelayMs, backoffFactor, maxDelayMs, jitter } = this.retryConfig;
        let delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
        delay = Math.min(delay, maxDelayMs);

        if (jitter) {
            // Full jitter / Equal jitter style Polly : ajout d'une variation aléatoire entre 0% et 30%
            const jitterRange = delay * 0.3;
            const randomJitter = (Math.random() * jitterRange * 2) - jitterRange;
            delay = Math.max(0, Math.round(delay + randomJitter));
        }

        return delay;
    }

    /**
     * Exécute une action asynchrone avec application stricte du timeout
     * @param {Function} asyncAction
     * @param {object} context
     * @returns {Promise<any>}
     */
    async executeWithTimeout(asyncAction, context = {}) {
        if (!this.timeoutMs || this.timeoutMs <= 0) {
            return await asyncAction(context);
        }

        let timer = null;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                const err = new Error(`Délai d'exécution dépassé (${this.timeoutMs}ms)`);
                err.code = 'ETIMEDOUT';
                err.isTimeout = true;
                reject(err);
            }, this.timeoutMs);
        });

        try {
            const result = await Promise.race([
                asyncAction(context),
                timeoutPromise
            ]);
            return result;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /**
     * Exécute l'action avec l'ensemble des règles de résilience
     * @param {Function} asyncAction - (context) => Promise<any>
     * @param {object} [context={}]
     * @returns {Promise<any>}
     */
    async executeAsync(asyncAction, context = {}) {
        const maxRetries = Math.max(0, this.retryConfig.maxRetries || 0);
        let attempt = 0;
        let lastError = null;

        while (true) {
            attempt++;
            try {
                const currentContext = {
                    ...context,
                    attempt,
                    maxRetries,
                    isLastAttempt: attempt > maxRetries
                };

                return await this.executeWithTimeout(asyncAction, currentContext);

            } catch (error) {
                lastError = error;

                const isRetryable = this.shouldHandleError(error);
                const canRetry = isRetryable && attempt <= maxRetries;

                if (canRetry) {
                    const delayMs = this.calculateDelay(attempt);

                    if (this.retryConfig.onRetry) {
                        try {
                            await this.retryConfig.onRetry(error, attempt, delayMs, context);
                        } catch (cbErr) {
                            console.warn('⚠️ [ResiliencePolicy] Erreur dans le callback onRetry:', cbErr.message);
                        }
                    }

                    if (delayMs > 0) {
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                    continue;
                }

                // Toutes les tentatives sont épuisées ou erreur non gérée
                if (this.fallbackHandler) {
                    try {
                        return await this.fallbackHandler(error, { ...context, attempt, lastError });
                    } catch (fallbackErr) {
                        throw fallbackErr;
                    }
                }

                throw error;
            }
        }
    }
}

module.exports = {
    ResiliencePolicy
};
