const OpenAI = require('openai');
require('dotenv').config();

// Initialiser le client OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * Appeler ChatGPT avec un prompt simple
 * 
 * @param {string} prompt - Le message/question à envoyer
 * @param {object} options - Options supplémentaires
 * @param {string} options.model - Modèle à utiliser (défaut: gpt-4o-mini)
 * @param {number} options.maxTokens - Nombre maximum de tokens (défaut: 1000)
 * @param {number} options.temperature - Créativité 0-2 (défaut: 0.7)
 * @param {string} options.systemPrompt - Instructions système
 * 
 * @returns {Promise<object>} Réponse de ChatGPT
 * 
 * @example
 * const response = await callChatGPT('Explique-moi JavaScript');
 * console.log(response.text);
 */
async function callChatGPT(prompt, options = {}) {
    try {
        const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const maxTokens = options.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS) || 1000;
        const temperature = options.temperature || parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;
        
        // Construire les messages
        const messages = [];
        
        // Ajouter le system prompt si fourni
        if (options.systemPrompt) {
            messages.push({
                role: 'system',
                content: options.systemPrompt
            });
        }
        
        // Ajouter le prompt utilisateur
        messages.push({
            role: 'user',
            content: prompt
        });
        
        console.log(`🤖 Appel ChatGPT (${model})...`);
        
        // Appeler l'API
        const completion = await openai.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature
        });
        
        // Extraire la réponse
        const response = {
            text: completion.choices[0].message.content,
            model: completion.model,
            usage: {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens
            },
            finishReason: completion.choices[0].finish_reason
        };
        
        console.log(`✅ Réponse reçue (${response.usage.totalTokens} tokens)`);
        
        return response;
        
    } catch (error) {
        console.error('❌ Erreur ChatGPT:', error);
        
        if (error.status === 401) {
            throw new Error('Clé API OpenAI invalide. Vérifiez votre .env');
        } else if (error.status === 429) {
            throw new Error('Limite de taux atteinte. Attendez un peu avant de réessayer.');
        } else if (error.status === 500) {
            throw new Error('Erreur serveur OpenAI. Réessayez plus tard.');
        } else {
            throw error;
        }
    }
}

/**
 * Appeler ChatGPT avec un historique de conversation
 * 
 * @param {Array} conversationHistory - Historique des messages [{role: 'user'|'assistant', content: '...'}]
 * @param {string} newMessage - Nouveau message de l'utilisateur
 * @param {object} options - Options
 * 
 * @returns {Promise<object>} Réponse de ChatGPT
 * 
 * @example
 * const history = [
 *   { role: 'user', content: 'Bonjour' },
 *   { role: 'assistant', content: 'Bonjour ! Comment puis-je vous aider ?' }
 * ];
 * const response = await callChatGPTWithHistory(history, 'Parle-moi de JavaScript');
 */
async function callChatGPTWithHistory(conversationHistory, newMessage, options = {}) {
    try {
        const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const maxTokens = options.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS) || 1000;
        const temperature = options.temperature || parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;
        
        // Construire les messages
        const messages = [];
        
        // Ajouter le system prompt si fourni
        if (options.systemPrompt) {
            messages.push({
                role: 'system',
                content: options.systemPrompt
            });
        }
        
        // Ajouter l'historique
        messages.push(...conversationHistory);
        
        // Ajouter le nouveau message
        messages.push({
            role: 'user',
            content: newMessage
        });
        
        console.log(`🤖 Appel ChatGPT avec historique (${conversationHistory.length} messages)...`);
        
        // Appeler l'API
        const completion = await openai.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature
        });
        
        // Extraire la réponse
        const response = {
            text: completion.choices[0].message.content,
            model: completion.model,
            usage: {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens
            },
            finishReason: completion.choices[0].finish_reason,
            // Retourner l'historique mis à jour
            updatedHistory: [
                ...conversationHistory,
                { role: 'user', content: newMessage },
                { role: 'assistant', content: completion.choices[0].message.content }
            ]
        };
        
        console.log(`✅ Réponse reçue (${response.usage.totalTokens} tokens)`);
        
        return response;
        
    } catch (error) {
        console.error('❌ Erreur ChatGPT:', error);
        throw error;
    }
}

/**
 * Générer une image avec DALL-E
 * 
 * @param {string} prompt - Description de l'image à générer
 * @param {object} options - Options
 * @param {string} options.model - Modèle (dall-e-2 ou dall-e-3)
 * @param {string} options.size - Taille (256x256, 512x512, 1024x1024, 1792x1024, 1024x1792)
 * @param {string} options.quality - Qualité (standard ou hd)
 * @param {number} options.n - Nombre d'images (1-10 pour dall-e-2, 1 pour dall-e-3)
 * 
 * @returns {Promise<object>} URL(s) de l'image générée
 */
async function generateImage(prompt, options = {}) {
    try {
        const model = options.model || 'dall-e-3';
        const size = options.size || '1024x1024';
        const quality = options.quality || 'standard';
        const n = options.n || 1;
        
        console.log(`🎨 Génération d'image avec ${model}...`);
        
        const response = await openai.images.generate({
            model: model,
            prompt: prompt,
            n: n,
            size: size,
            quality: quality
        });
        
        console.log(`✅ Image générée: ${response.data[0].url}`);
        
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
 * Analyser une image avec GPT-4 Vision
 * 
 * @param {string} imageUrl - URL de l'image à analyser
 * @param {string} question - Question sur l'image
 * @param {object} options - Options
 * 
 * @returns {Promise<object>} Analyse de l'image
 */
async function analyzeImage(imageUrl, question, options = {}) {
    try {
        const model = options.model || 'gpt-4o';
        const maxTokens = options.maxTokens || 500;
        
        console.log(`👁️ Analyse d'image avec ${model}...`);
        
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: question },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageUrl
                            }
                        }
                    ]
                }
            ],
            max_tokens: maxTokens
        });
        
        const response = {
            text: completion.choices[0].message.content,
            usage: {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens
            }
        };
        
        console.log(`✅ Image analysée (${response.usage.totalTokens} tokens)`);
        
        return response;
        
    } catch (error) {
        console.error('❌ Erreur analyse image:', error);
        throw error;
    }
}

/**
 * Calculer le coût approximatif d'un appel
 * 
 * @param {string} model - Modèle utilisé
 * @param {number} promptTokens - Tokens du prompt
 * @param {number} completionTokens - Tokens de la réponse
 * 
 * @returns {number} Coût en dollars
 */
function calculateCost(model, promptTokens, completionTokens) {
    // Prix au million de tokens (janvier 2025)
    const pricing = {
        'gpt-4o': { input: 2.50, output: 10.00 },
        'gpt-4o-mini': { input: 0.15, output: 0.60 },
        'gpt-3.5-turbo': { input: 0.50, output: 1.50 }
    };
    
    const modelPricing = pricing[model] || pricing['gpt-4o-mini'];
    
    const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
    const outputCost = (completionTokens / 1_000_000) * modelPricing.output;
    
    return inputCost + outputCost;
}

/**
 * Estimer le nombre de tokens dans un texte
 * 
 * @param {string} text - Texte à estimer
 * @returns {number} Nombre approximatif de tokens
 */
function estimateTokens(text) {
    // Approximation : ~4 caractères = 1 token pour l'anglais
    // ~2-3 caractères = 1 token pour le français
    return Math.ceil(text.length / 3);
}

async function callResponseCustom(prompt, options = {}) {
    try {
        const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const maxTokens = options.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS) || 1000;
        const temperature = options.temperature || parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;
    


        const url = `https://api.openai.com/v1/responses`;
        const config = {
            "method" : 'POST',
            "headers": {
                'Content-Type': 'application/json',
                'Authorization':'Bearer '+process.env.OPENAI_API_KEY
            }
        }
        var body = {
                "model": model,
                "input": prompt,
            }
        
        if (options.systemPrompt){
            body['instructions'] = options.systemPrompt;
        }
        if (options.previousMsg){
            body['previous_response_id'] = options.previousMsg;
        }
        if (options.temperature){
            body['temperature'] = options.temperature;
        }else{
            body['temperature'] = 1;
        }
        body['presence_penalty'] = 0,5;
        body['frequency_penalty'] = 0,5;
        body['temperature'] = 1,8;
        config['body'] = JSON.stringify(body)
        console.log('Test CallOPEN :'+JSON.stringify(config));
        const retour = await fetch(url,config);
        // Vérifier si la réponse est OK (status 200-299)
            if (!retour.ok) {
                const errorData = await retour.json().catch(() => ({}));
                throw new Error(
                `Erreur HTTP ${retour.status}: ${errorData.message || retour.statusText}`
                );
            }
        const data = await retour.json();
        const text =
            data.output
                .find(item => item.type === "message")
                    .content[0]
                        .text;
        const status = 
            data.output
                .find(item => item.type === "message")
                    .status;
        console.log('Test of retour GPT : '+text);
        // Extraire la réponse
        const response = {
            text: text,
            model: data['model'],
            usage: {
                promptTokens: data['usage']['input_tokens'],
                completionTokens: data['usage']['output_tokens'],
                totalTokens: data['usage']['total_tokens']
            },
            finishReason: status,
            msgId : data['id'],
            rawData : JSON.stringify(data)
        };
        if(data.previous_response_id){
            response['previousMsgId'] = data['previous_response_id'];
        }
        //console.log(`✅ Réponse reçue (${response.usage.totalTokens} tokens)`);
        return response;
        
    } catch (error) {
        console.error('❌ Erreur ChatGPT:', error);
        
        if (error.status === 401) {
            throw new Error('Clé API OpenAI invalide. Vérifiez votre .env');
        } else if (error.status === 429) {
            throw new Error('Limite de taux atteinte. Attendez un peu avant de réessayer.');
        } else if (error.status === 500) {
            throw new Error('Erreur serveur OpenAI. Réessayez plus tard.');
        } else {
            throw error;
        }
    }
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