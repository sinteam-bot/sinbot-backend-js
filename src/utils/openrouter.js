// OpenRouter utilise l'API standard compatible OpenAI.
// On utilise donc le SDK 'openai' en pointant sur l'URL d'OpenRouter (https://openrouter.ai/api/v1).
const OpenAI = require('openai');
const { config, getConfig } = require('../config/index.js');
const { ResiliencePolicy } = require('./resiliencePolicy.js');

// Cache mémoire pour la liste dynamique des modèles OpenRouter
let cachedModels = null;
let lastModelsFetch = 0;
const MODELS_CACHE_TTL = 3600 * 1000; // 1 heure de cache

/**
 * Récupère la liste des modèles de secours configurés dans config.yml
 */
function getFallbackModelsFromConfig() {
    const currentConfig = getConfig ? getConfig() : config;
    const fromOpenRouter = currentConfig.openrouter?.fallback_models;
    const fromDaily = currentConfig.daily_message?.ai_config?.fallback_models;

    if (Array.isArray(fromOpenRouter) && fromOpenRouter.length > 0) {
        return fromOpenRouter;
    }
    if (Array.isArray(fromDaily) && fromDaily.length > 0) {
        return fromDaily;
    }

    return [
        'openai/gpt-oss-20b:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'mistralai/mistral-7b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free',
        'deepseek/deepseek-chat:free',
        'nvidia/nemotron-3-ultra-550b-a55b:free'
    ];
}

/**
 * Construit la politique de retry style Polly à partir de config.yml
 */
function getRetryPolicyFromConfig(customOptions = {}) {
    const currentConfig = getConfig ? getConfig() : config;
    const r = currentConfig.openrouter?.retry_policy || {};

    const maxRetries = customOptions.maxRetries !== undefined
        ? customOptions.maxRetries
        : (r.max_retries !== undefined ? Number(r.max_retries) : 2);

    const initialDelayMs = customOptions.initialDelayMs || (r.initial_delay_ms ? Number(r.initial_delay_ms) : 1000);
    const backoffFactor = customOptions.backoffFactor || (r.backoff_factor ? Number(r.backoff_factor) : 2.0);
    const maxDelayMs = customOptions.maxDelayMs || (r.max_delay_ms ? Number(r.max_delay_ms) : 10000);
    const jitter = customOptions.jitter !== undefined ? customOptions.jitter : (r.jitter !== false);
    const timeoutMs = customOptions.timeoutMs || (r.timeout_ms ? Number(r.timeout_ms) : 25000);
    const statusCodes = Array.isArray(r.retryable_statuses) ? r.retryable_statuses : [408, 429, 500, 502, 503, 504];

    return ResiliencePolicy.handleStatusCodes(statusCodes)
        .waitAndRetryAsync({
            maxRetries,
            initialDelayMs,
            backoffFactor,
            maxDelayMs,
            jitter,
            onRetry: (err, attempt, delayMs, ctx) => {
                console.warn(`⏳ [Polly Retry] Tentative ${attempt}/${maxRetries} après pause de ${delayMs}ms pour le modèle "${ctx.model || 'inconnu'}" (Erreur: ${err.message})`);
            }
        })
        .timeoutAsync(timeoutMs);
}

/**
 * Récupère ou instancie le client OpenAI connecté à OpenRouter
 */
function getClient() {
    const currentConfig = getConfig ? getConfig() : config;
    const apiKey = currentConfig.openrouter?.api_key || process.env.OPENROUTER_API_KEY;
    const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    return new OpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: baseURL,
        defaultHeaders: {
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://github.com',
            'X-Title': process.env.OPENROUTER_SITE_NAME || 'Discord Bot',
        }
    });
}

const client = getClient();

// Modèle par défaut dynamique pour OpenRouter
function getDefaultModel() {
    const currentConfig = getConfig ? getConfig() : config;
    return currentConfig.daily_message?.ai_config?.model ||
           currentConfig.openrouter?.default_model ||
           process.env.OPENROUTER_MODEL ||
           'openai/gpt-oss-20b:free';
}

const DEFAULT_MODEL = 'openai/gpt-oss-20b:free';

/**
 * Extrait et valide de manière sécurisée les données d'une completion OpenRouter
 */
function extractCompletionData(completion) {
    if (!completion) {
        throw new Error('Réponse OpenRouter vide (null ou non définie)');
    }
    if (completion.error) {
        const errMsg = completion.error.message || JSON.stringify(completion.error);
        throw new Error(`Erreur API OpenRouter : ${errMsg}`);
    }
    if (!Array.isArray(completion.choices) || completion.choices.length === 0) {
        throw new Error(`Réponse OpenRouter sans choix disponible (choices: ${JSON.stringify(completion.choices)})`);
    }
    const choice = completion.choices[0];
    if (!choice) {
        throw new Error('Premier choix du modèle non défini');
    }
    if (choice.message?.refusal) {
        throw new Error(`Le modèle a refusé la requête : ${choice.message.refusal}`);
    }
    const text = choice.message?.content !== undefined ? choice.message.content : (choice.text !== undefined ? choice.text : '');
    return {
        text: String(text).trim(),
        finishReason: choice.finish_reason || 'stop',
        model: completion.model || 'unknown',
        id: completion.id || 'msg_' + Date.now(),
        usage: {
            promptTokens: completion.usage?.prompt_tokens || 0,
            completionTokens: completion.usage?.completion_tokens || 0,
            totalTokens: completion.usage?.total_tokens || 0
        },
        rawData: typeof completion === 'string' ? completion : JSON.stringify(completion)
    };
}

/**
 * Récupère dynamiquement la liste des modèles disponibles depuis l'API OpenRouter
 * avec mise en cache locale d'une heure et fallback sécurisé.
 * 
 * @param {boolean} forceRefresh - Forcer le rafraîchissement du cache
 * @returns {Promise<Array<{ id: string, name: string, description: string, contextLength: number, isFree: boolean, pricing: object, provider: string }>>}
 */
async function getOpenRouterModelsList(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedModels && (now - lastModelsFetch < MODELS_CACHE_TTL)) {
        return cachedModels;
    }

    try {
        const currentConfig = getConfig ? getConfig() : config;
        const apiKey = currentConfig.openrouter?.api_key || process.env.OPENROUTER_API_KEY;
        const headers = {
            'Accept': 'application/json'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
        if (!res.ok) {
            throw new Error(`OpenRouter API a répondu HTTP ${res.status}`);
        }

        const json = await res.json();
        const rawData = Array.isArray(json.data) ? json.data : [];

        const formatted = rawData.map(m => {
            const promptPrice = parseFloat(m.pricing?.prompt || '0');
            const completionPrice = parseFloat(m.pricing?.completion || '0');
            const isFree = (promptPrice === 0 && completionPrice === 0) || m.id.endsWith(':free');

            const idParts = m.id.split('/');
            const provider = idParts[0] || 'other';

            return {
                id: m.id,
                name: m.name || m.id,
                description: m.description || '',
                contextLength: m.context_length || 4096,
                isFree,
                pricing: {
                    prompt: promptPrice,
                    completion: completionPrice
                },
                provider
            };
        });

        // Trier : modèles gratuits d'abord, puis alphabétique par nom
        formatted.sort((a, b) => {
            if (a.isFree && !b.isFree) return -1;
            if (!a.isFree && b.isFree) return 1;
            return a.name.localeCompare(b.name);
        });

        cachedModels = formatted;
        lastModelsFetch = now;
        return formatted;
    } catch (err) {
        console.warn('⚠️ [OpenRouter] Erreur récupération de la liste des modèles depuis OpenRouter:', err.message);
        if (cachedModels) return cachedModels;

        // Fallback statique
        return getFallbackModelsList();
    }
}

/**
 * Liste statique de secours en cas d'impossibilité de contacter l'API OpenRouter
 */
function getFallbackModelsList() {
    return [
        { id: 'openai/gpt-oss-20b:free', name: 'OpenAI: GPT-OSS 20B (free)', isFree: true, contextLength: 8192, provider: 'openai' },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta: Llama 3.3 70B Instruct (free)', isFree: true, contextLength: 131072, provider: 'meta-llama' },
        { id: 'google/gemini-2.0-flash-exp:free', name: 'Google: Gemini 2.0 Flash Experimental (free)', isFree: true, contextLength: 1048576, provider: 'google' },
        { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral: Mistral 7B Instruct (free)', isFree: true, contextLength: 32768, provider: 'mistralai' },
        { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen: Qwen 2.5 72B Instruct (free)', isFree: true, contextLength: 32768, provider: 'qwen' },
        { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek: DeepSeek V3 (free)', isFree: true, contextLength: 64000, provider: 'deepseek' },
        { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nvidia: Nemotron 3 Ultra 550B (free)', isFree: true, contextLength: 8192, provider: 'nvidia' },
        { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o Mini', isFree: false, contextLength: 128000, provider: 'openai' },
        { id: 'openai/gpt-4o', name: 'OpenAI: GPT-4o', isFree: false, contextLength: 128000, provider: 'openai' },
        { id: 'anthropic/claude-3.5-haiku', name: 'Anthropic: Claude 3.5 Haiku', isFree: false, contextLength: 200000, provider: 'anthropic' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Anthropic: Claude 3.5 Sonnet', isFree: false, contextLength: 200000, provider: 'anthropic' }
    ];
}

/**
 * Appeler un LLM via OpenRouter avec politique de retry Polly et bascule de modèles configurés
 * 
 * @param {string} prompt - Le message/question à envoyer
 * @param {object} options - Options supplémentaires
 * @param {string} options.model - Modèle à utiliser
 * @param {number} options.maxTokens - Nombre maximum de tokens
 * @param {number} options.temperature - Créativité 0-2 (défaut: 0.7)
 * @param {string} options.systemPrompt - Instructions système
 * @param {boolean} options.allowFallback - Permet de basculer sur un modèle de secours en cas d'échec
 * 
 * @returns {Promise<object>} Réponse de l'IA
 */
async function callChatGPT(prompt, options = {}) {
    const primaryModel = options.model || getDefaultModel();
    const modelsToTry = [primaryModel];

    if (options.allowFallback !== false) {
        const configuredFallbacks = getFallbackModelsFromConfig();
        for (const fb of configuredFallbacks) {
            if (!modelsToTry.includes(fb)) modelsToTry.push(fb);
        }
    }

    const policy = getRetryPolicyFromConfig(options.retryOptions || {});
    let lastError = null;

    for (const currentModel of modelsToTry) {
        try {
            const maxTokens = options.maxTokens || parseInt(process.env.OPENROUTER_MAX_TOKENS) || 1000;
            const temperature = options.temperature !== undefined ? options.temperature : (parseFloat(process.env.OPENROUTER_TEMPERATURE) || 0.7);

            const messages = [];
            if (options.systemPrompt) {
                messages.push({
                    role: 'system',
                    content: options.systemPrompt
                });
            }
            messages.push({
                role: 'user',
                content: prompt
            });

            console.log(`🤖 Appel OpenRouter (${currentModel})...`);

            const apiClient = client.chat ? client : getClient();

            // Exécution sécurisée par la politique de retry Polly
            const completion = await policy.executeAsync(async () => {
                return await apiClient.chat.completions.create({
                    model: currentModel,
                    messages: messages,
                    max_tokens: maxTokens,
                    temperature: temperature
                });
            }, { model: currentModel });

            const data = extractCompletionData(completion);

            const response = {
                text: data.text,
                model: data.model,
                usage: data.usage,
                finishReason: data.finishReason
            };

            console.log(`✅ Réponse reçue OpenRouter (${response.usage.totalTokens} tokens, modèle: ${data.model})`);
            return response;

        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [OpenRouter] Échec avec le modèle "${currentModel}" après politique de retry: ${error.message}`);
            if (options.allowFallback === false) break;
        }
    }

    console.error('❌ Erreur OpenRouter (tous les modèles et retries ont échoué):', lastError);
    if (lastError?.status === 401) {
        throw new Error('Clé API OpenRouter invalide. Vérifiez OPENROUTER_API_KEY dans votre configuration.');
    } else if (lastError?.status === 429) {
        throw new Error('Limite de taux ou crédits insuffisants sur OpenRouter.');
    } else {
        throw lastError || new Error('Échec des appels OpenRouter.');
    }
}

/**
 * Appeler OpenRouter avec un historique de conversation et politique de retry Polly
 */
async function callChatGPTWithHistory(conversationHistory, newMessage, options = {}) {
    const primaryModel = options.model || getDefaultModel();
    const modelsToTry = [primaryModel];

    if (options.allowFallback !== false) {
        const configuredFallbacks = getFallbackModelsFromConfig();
        for (const fb of configuredFallbacks) {
            if (!modelsToTry.includes(fb)) modelsToTry.push(fb);
        }
    }

    const policy = getRetryPolicyFromConfig(options.retryOptions || {});
    let lastError = null;

    for (const currentModel of modelsToTry) {
        try {
            const maxTokens = options.maxTokens || parseInt(process.env.OPENROUTER_MAX_TOKENS) || 1000;
            const temperature = options.temperature !== undefined ? options.temperature : (parseFloat(process.env.OPENROUTER_TEMPERATURE) || 0.7);

            const messages = [];
            if (options.systemPrompt) {
                messages.push({
                    role: 'system',
                    content: options.systemPrompt
                });
            }

            messages.push(...conversationHistory);
            messages.push({
                role: 'user',
                content: newMessage
            });

            console.log(`🤖 Appel OpenRouter avec historique (${conversationHistory.length} messages, modèle: ${currentModel})...`);

            const apiClient = client.chat ? client : getClient();

            const completion = await policy.executeAsync(async () => {
                return await apiClient.chat.completions.create({
                    model: currentModel,
                    messages: messages,
                    max_tokens: maxTokens,
                    temperature: temperature
                });
            }, { model: currentModel });

            const data = extractCompletionData(completion);

            const response = {
                text: data.text,
                model: data.model,
                usage: data.usage,
                finishReason: data.finishReason,
                updatedHistory: [
                    ...conversationHistory,
                    { role: 'user', content: newMessage },
                    { role: 'assistant', content: data.text }
                ]
            };

            console.log(`✅ Réponse reçue OpenRouter (${response.usage.totalTokens} tokens, modèle: ${data.model})`);
            return response;

        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [OpenRouter] Échec avec historique sur "${currentModel}": ${error.message}`);
            if (options.allowFallback === false) break;
        }
    }

    console.error('❌ Erreur OpenRouter avec historique:', lastError);
    throw lastError || new Error('Échec des appels OpenRouter avec historique.');
}

/**
 * Générer une image via OpenRouter / OpenAI API
 */
async function generateImage(prompt, options = {}) {
    try {
        const model = options.model || 'dall-e-3';
        const size = options.size || '1024x1024';
        const quality = options.quality || 'standard';
        const n = options.n || 1;

        console.log(`🎨 Génération d'image (${model})...`);

        const apiClient = client.images ? client : getClient();
        const response = await apiClient.images.generate({
            model: model,
            prompt: prompt,
            n: n,
            size: size,
            quality: quality
        });

        return {
            urls: response.data ? response.data.map(img => img.url) : [],
            revisedPrompt: response.data?.[0]?.revised_prompt || prompt
        };

    } catch (error) {
        console.error('❌ Erreur génération image:', error);
        throw error;
    }
}

/**
 * Analyser une image avec modèle multimodal via OpenRouter
 */
async function analyzeImage(imageUrl, question, options = {}) {
    try {
        const model = options.model || getDefaultModel();
        const maxTokens = options.maxTokens || 500;

        console.log(`👁️ Analyse d'image avec OpenRouter (${model})...`);

        const apiClient = client.chat ? client : getClient();
        const completion = await apiClient.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: question },
                        {
                            type: 'image_url',
                            image_url: { url: imageUrl }
                        }
                    ]
                }
            ],
            max_tokens: maxTokens
        });

        const data = extractCompletionData(completion);

        return {
            text: data.text,
            usage: data.usage
        };

    } catch (error) {
        console.error('❌ Erreur analyse image:', error);
        throw error;
    }
}

/**
 * Fonction personnalisée compatible avec le reste du bot (remplace les appels custom OpenAI par OpenRouter)
 * avec politique de retry Polly et bascule de modèles configurés
 */
async function callResponseCustom(prompt, options = {}) {
    const primaryModel = options.model || getDefaultModel();
    const modelsToTry = [primaryModel];

    if (options.allowFallback !== false) {
        const configuredFallbacks = getFallbackModelsFromConfig();
        for (const fb of configuredFallbacks) {
            if (!modelsToTry.includes(fb)) modelsToTry.push(fb);
        }
    }

    const policy = getRetryPolicyFromConfig(options.retryOptions || {});
    let lastError = null;

    for (const currentModel of modelsToTry) {
        try {
            const maxTokens = options.maxTokens || parseInt(process.env.OPENROUTER_MAX_TOKENS) || 1000;
            const temperature = options.temperature !== undefined ? options.temperature : 0.7;

            const messages = [];
            if (options.systemPrompt) {
                messages.push({
                    role: 'system',
                    content: options.systemPrompt
                });
            }
            messages.push({
                role: 'user',
                content: prompt
            });

            console.log(`🤖 Appel OpenRouter (callResponseCustom - ${currentModel})...`);

            const apiClient = client.chat ? client : getClient();

            const completion = await policy.executeAsync(async () => {
                return await apiClient.chat.completions.create({
                    model: currentModel,
                    messages: messages,
                    max_tokens: maxTokens,
                    temperature: temperature
                });
            }, { model: currentModel });

            const data = extractCompletionData(completion);

            const response = {
                text: data.text,
                model: data.model,
                usage: data.usage,
                finishReason: data.finishReason,
                msgId: data.id,
                rawData: data.rawData
            };

            return response;

        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [OpenRouter] Échec callResponseCustom sur "${currentModel}" après retry: ${error.message}`);
            if (options.allowFallback === false) break;
        }
    }

    console.error('❌ Erreur OpenRouter custom (tous les modèles ont échoué):', lastError);
    throw lastError || new Error('Échec des appels OpenRouter custom.');
}

function calculateCost(model, promptTokens, completionTokens) {
    const pricing = {
        'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
        'openai/gpt-4o': { input: 2.50, output: 10.00 },
        'anthropic/claude-3.5-haiku': { input: 0.80, output: 4.00 },
        'deepseek/deepseek-r1': { input: 0.55, output: 2.19 }
    };

    const modelPricing = pricing[model] || pricing['openai/gpt-4o-mini'];
    const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
    const outputCost = (completionTokens / 1_000_000) * modelPricing.output;
    return inputCost + outputCost;
}

function estimateTokens(text) {
    return Math.ceil((text || '').length / 3);
}

module.exports = {
    client,
    getClient,
    callChatGPT,
    callChatGPTWithHistory,
    generateImage,
    analyzeImage,
    calculateCost,
    estimateTokens,
    callResponseCustom,
    getOpenRouterModelsList,
    getFallbackModelsFromConfig,
    getRetryPolicyFromConfig
};
