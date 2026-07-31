const OpenAI = require('openai');
require('dotenv').config();

// Initialiser le client OpenAI pour OpenRouter
const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
    defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://github.com',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'Discord Bot',
    }
});

// Modèle par défaut pour OpenRouter
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-4o-mini';

/**
 * Appeler un LLM via OpenRouter avec un prompt simple
 * 
 * @param {string} prompt - Le message/question à envoyer
 * @param {object} options - Options supplémentaires
 * @param {string} options.model - Modèle à utiliser (ex: openai/gpt-4o-mini, anthropic/claude-3.5-haiku, google/gemini-2.5-flash)
 * @param {number} options.maxTokens - Nombre maximum de tokens
 * @param {number} options.temperature - Créativité 0-2 (défaut: 0.7)
 * @param {string} options.systemPrompt - Instructions système
 * 
 * @returns {Promise<object>} Réponse de l'IA
 */
async function callChatGPT(prompt, options = {}) {
    try {
        const model = options.model || DEFAULT_MODEL;
        const maxTokens = options.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS) || 1000;
        const temperature = options.temperature !== undefined ? options.temperature : (parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7);

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

        console.log(`🤖 Appel OpenRouter (${model})...`);

        const completion = await openai.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature
        });

        const response = {
            text: completion.choices[0].message.content,
            model: completion.model,
            usage: {
                promptTokens: completion.usage?.prompt_tokens || 0,
                completionTokens: completion.usage?.completion_tokens || 0,
                totalTokens: completion.usage?.total_tokens || 0
            },
            finishReason: completion.choices[0].finish_reason
        };

        console.log(`✅ Réponse reçue OpenRouter (${response.usage.totalTokens} tokens)`);
        return response;

    } catch (error) {
        console.error('❌ Erreur OpenRouter:', error);

        if (error.status === 401) {
            throw new Error('Clé API OpenRouter invalide. Vérifiez OPENROUTER_API_KEY dans votre configuration.');
        } else if (error.status === 429) {
            throw new Error('Limite de taux ou crédits insuffisants sur OpenRouter.');
        } else {
            throw error;
        }
    }
}

/**
 * Appeler OpenRouter avec un historique de conversation
 */
async function callChatGPTWithHistory(conversationHistory, newMessage, options = {}) {
    try {
        const model = options.model || DEFAULT_MODEL;
        const maxTokens = options.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS) || 1000;
        const temperature = options.temperature !== undefined ? options.temperature : (parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7);

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

        console.log(`🤖 Appel OpenRouter avec historique (${conversationHistory.length} messages, modèle: ${model})...`);

        const completion = await openai.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature
        });

        const content = completion.choices[0].message.content;

        const response = {
            text: content,
            model: completion.model,
            usage: {
                promptTokens: completion.usage?.prompt_tokens || 0,
                completionTokens: completion.usage?.completion_tokens || 0,
                totalTokens: completion.usage?.total_tokens || 0
            },
            finishReason: completion.choices[0].finish_reason,
            updatedHistory: [
                ...conversationHistory,
                { role: 'user', content: newMessage },
                { role: 'assistant', content: content }
            ]
        };

        console.log(`✅ Réponse reçue OpenRouter (${response.usage.totalTokens} tokens)`);
        return response;

    } catch (error) {
        console.error('❌ Erreur OpenRouter:', error);
        throw error;
    }
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

        const response = await openai.images.generate({
            model: model,
            prompt: prompt,
            n: n,
            size: size,
            quality: quality
        });

        return {
            urls: response.data.map(img => img.url),
            revisedPrompt: response.data[0].revised_prompt || prompt
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
        const model = options.model || DEFAULT_MODEL;
        const maxTokens = options.maxTokens || 500;

        console.log(`👁️ Analyse d'image avec OpenRouter (${model})...`);

        const completion = await openai.chat.completions.create({
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

        return {
            text: completion.choices[0].message.content,
            usage: {
                promptTokens: completion.usage?.prompt_tokens || 0,
                completionTokens: completion.usage?.completion_tokens || 0,
                totalTokens: completion.usage?.total_tokens || 0
            }
        };

    } catch (error) {
        console.error('❌ Erreur analyse image:', error);
        throw error;
    }
}

/**
 * Fonction personnalisée compatible avec le reste du bot (remplace les appels custom OpenAI par OpenRouter)
 */
async function callResponseCustom(prompt, options = {}) {
    try {
        const model = options.model || DEFAULT_MODEL;
        const maxTokens = options.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS) || 1000;
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

        console.log(`🤖 Appel OpenRouter (callResponseCustom - ${model})...`);

        const completion = await openai.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature
        });

        const text = completion.choices[0].message.content;

        const response = {
            text: text,
            model: completion.model,
            usage: {
                promptTokens: completion.usage?.prompt_tokens || 0,
                completionTokens: completion.usage?.completion_tokens || 0,
                totalTokens: completion.usage?.total_tokens || 0
            },
            finishReason: completion.choices[0].finish_reason,
            msgId: completion.id,
            rawData: JSON.stringify(completion)
        };

        return response;

    } catch (error) {
        console.error('❌ Erreur OpenRouter custom:', error);
        throw error;
    }
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
    callChatGPT,
    callChatGPTWithHistory,
    generateImage,
    analyzeImage,
    calculateCost,
    estimateTokens,
    callResponseCustom
};
