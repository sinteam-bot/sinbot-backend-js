/**
 * src/modules/util_autofeeds/services/providers/ai-models.provider.js
 *
 * Fournisseur spécialisé pour la veille et le suivi des nouveaux modèles d'IA :
 * - OpenRouter (Flux RSS & API JSON)
 * - Models.dev (Agrégateur de 220+ providers, dont OpenCode Go, DeepInfra, etc.)
 * - Détection et filtrage des modèles gratuits (0$ / tokens).
 */

const { BaseFeedProvider } = require('./base.provider.js');

class AiModelsFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'ai_models',
            label: 'Modèles IA (OpenRouter & Models.dev)',
            icon: '🤖',
            description: 'Suivi des nouveaux modèles IA et détection des modèles gratuits (OpenCode Go, OpenRouter, etc.).'
        });
    }

    /**
     * Analyse l'URL ou l'identifiant pour déterminer la source et le fournisseur cible.
     */
    resolveUrl(input = '') {
        const raw = (input || '').trim();
        if (!raw || raw.toLowerCase() === 'openrouter') {
            return 'https://openrouter.ai/api/v1/models?use_rss=true';
        }
        if (raw.toLowerCase() === 'models.dev' || raw.toLowerCase() === 'modelsdev') {
            return 'https://models.dev/api.json';
        }
        if (raw.toLowerCase() === 'opencode-go' || raw.toLowerCase() === 'opencode') {
            return 'https://models.dev/api.json?provider=opencode-go';
        }
        return raw;
    }

    /**
     * Récupère les nouveaux modèles selon l'URL (OpenRouter ou Models.dev).
     */
    async fetchItems(feed) {
        const feedUrl = (feed.feedUrl || '').trim();
        const lowerUrl = feedUrl.toLowerCase();

        if (lowerUrl.includes('openrouter.ai') || lowerUrl === 'openrouter') {
            return this._fetchOpenRouter(feedUrl);
        }

        return this._fetchModelsDev(feedUrl);
    }

    /**
     * Traite les nouveautés OpenRouter (RSS ou API JSON).
     */
    async _fetchOpenRouter(feedUrl) {
        // Si l'URL demande explicitement du RSS ou par défaut
        const isRss = !feedUrl.includes('format=json') && (feedUrl.includes('use_rss=true') || !feedUrl.includes('/api/v1/models'));
        const requestUrl = isRss && !feedUrl.includes('use_rss=true')
            ? 'https://openrouter.ai/api/v1/models?use_rss=true'
            : feedUrl;

        const res = await fetch(requestUrl, {
            headers: { 'User-Agent': 'ChienneBot/3.0 (AiModelTracker)' },
            signal: AbortSignal.timeout(8000)
        });

        if (!res.ok) {
            throw new Error(`OpenRouter a répondu avec le statut HTTP ${res.status}`);
        }

        const text = await res.text();

        // 1. Si retour XML RSS
        if (text.includes('<rss') || text.includes('<channel>')) {
            const rawItems = text.split('<item>').slice(1);
            return rawItems.slice(0, 25).map(raw => {
                const titleMatch = raw.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
                const descMatch = raw.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s);
                const linkMatch = raw.match(/<link>(.*?)<\/link>/s);
                const guidMatch = raw.match(/<guid[^>]*>(.*?)<\/guid>/s);
                const dateMatch = raw.match(/<pubDate>(.*?)<\/pubDate>/s);

                const title = this.cleanHtml(titleMatch ? titleMatch[1] : 'Nouveau modèle OpenRouter');
                const description = this.cleanHtml(descMatch ? descMatch[1] : '');
                const link = linkMatch ? linkMatch[1].trim() : 'https://openrouter.ai';
                const guid = guidMatch ? guidMatch[1].trim() : link;
                const pubDate = dateMatch ? new Date(dateMatch[1]).getTime() : Date.now();

                const isFree = title.toLowerCase().includes(':free') || title.toLowerCase().includes('(free)') || description.toLowerCase().includes('free model');

                const tags = ['#ai', '#openrouter'];
                if (isFree) tags.push('#free', '#gratuit');

                const displayTitle = isFree 
                    ? `🆓 [Gratuit] ${title}` 
                    : `🤖 [Nouveau Modèle] ${title}`;

                return {
                    id: `openrouter:${guid}`,
                    guid: `openrouter:${guid}`,
                    title: displayTitle,
                    link,
                    url: link,
                    author: 'OpenRouter',
                    content: description || 'Nouveau modèle IA disponible sur OpenRouter.',
                    contentSnippet: description.slice(0, 280),
                    publishedAt: pubDate,
                    tags,
                    source: 'openrouter',
                    extra: {
                        provider: 'OpenRouter',
                        isFree,
                        modelName: title,
                        pricing: isFree ? '100% Gratuit' : 'Voir sur OpenRouter'
                    }
                };
            });
        }

        // 2. Si retour JSON OpenRouter
        try {
            const json = JSON.parse(text);
            const models = Array.isArray(json.data) ? json.data : [];
            // Trier par date de création décroissante
            const sorted = models.sort((a, b) => (b.created || 0) - (a.created || 0));

            return sorted.slice(0, 20).map(m => {
                const isFree = m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0');
                const displayTitle = isFree 
                    ? `🆓 [Gratuit] ${m.name || m.id}` 
                    : `🤖 [Nouveau Modèle] ${m.name || m.id}`;

                const costDesc = isFree 
                    ? '0$ / Gratuit' 
                    : `Entrée: $${(parseFloat(m.pricing?.prompt || 0) * 1000000).toFixed(2)}/1M • Sortie: $${(parseFloat(m.pricing?.completion || 0) * 1000000).toFixed(2)}/1M`;

                const link = `https://openrouter.ai/${m.id}`;
                const tags = ['#ai', '#openrouter'];
                if (isFree) tags.push('#free', '#gratuit');

                return {
                    id: `openrouter:${m.id}`,
                    guid: `openrouter:${m.id}`,
                    title: displayTitle,
                    link,
                    url: link,
                    author: 'OpenRouter',
                    content: m.description || `Modèle IA ${m.name}. Contexte: ${m.context_length ? Number(m.context_length).toLocaleString() : 'N/C'} tokens.`,
                    contentSnippet: (m.description || '').slice(0, 280),
                    publishedAt: m.created ? m.created * 1000 : Date.now(),
                    tags,
                    source: 'openrouter',
                    extra: {
                        provider: 'OpenRouter',
                        modelId: m.id,
                        modelName: m.name,
                        contextLength: m.context_length,
                        isFree,
                        pricing: costDesc
                    }
                };
            });
        } catch (e) {
            throw new Error(`Échec du décodage JSON OpenRouter: ${e.message}`);
        }
    }

    /**
     * Traite les nouveautés depuis Models.dev.
     */
    async _fetchModelsDev(feedUrl) {
        // Détecter si un fournisseur spécifique est ciblé (ex: opencode-go)
        let targetProviderId = null;
        if (feedUrl.includes('provider=')) {
            const match = feedUrl.match(/provider=([a-zA-Z0-9_-]+)/);
            if (match) targetProviderId = match[1];
        } else if (feedUrl.includes('/providers/')) {
            const match = feedUrl.match(/\/providers\/([a-zA-Z0-9_-]+)/);
            if (match) targetProviderId = match[1];
        }

        const isFreeFilter = feedUrl.includes('free=true') || feedUrl.includes('freeOnly=true');

        const apiUrl = 'https://models.dev/api.json';
        const res = await fetch(apiUrl, {
            headers: { 'User-Agent': 'ChienneBot/3.0 (ModelsDevTracker)' },
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) {
            throw new Error(`Models.dev a répondu avec le statut HTTP ${res.status}`);
        }

        const data = await res.json();
        const candidateModels = [];

        // Si fournisseur ciblé
        if (targetProviderId && data[targetProviderId]) {
            const p = data[targetProviderId];
            for (const [modelKey, m] of Object.entries(p.models || {})) {
                candidateModels.push({
                    providerId: p.id || targetProviderId,
                    providerName: p.name || targetProviderId,
                    providerDoc: p.doc || `https://models.dev/providers/${targetProviderId}`,
                    modelKey,
                    model: m
                });
            }
        } else {
            // Agrégation de tous les fournisseurs de models.dev
            for (const [pId, p] of Object.entries(data)) {
                for (const [modelKey, m] of Object.entries(p.models || {})) {
                    candidateModels.push({
                        providerId: pId,
                        providerName: p.name || pId,
                        providerDoc: p.doc || `https://models.dev/providers/${pId}`,
                        modelKey,
                        model: m
                    });
                }
            }
        }

        // Trier par date de sortie ou dernière mise à jour
        candidateModels.sort((a, b) => {
            const dateA = a.model.last_updated || a.model.release_date || '2020-01-01';
            const dateB = b.model.last_updated || b.model.release_date || '2020-01-01';
            return dateB.localeCompare(dateA);
        });

        const items = [];
        for (const item of candidateModels) {
            const m = item.model;
            if (!m || m.status === 'deprecated') continue;

            const cost = m.cost || {};
            const isFree = (cost.input === 0 && cost.output === 0) 
                || (typeof m.id === 'string' && m.id.toLowerCase().includes('-free'));

            if (isFreeFilter && !isFree) continue;

            const modelName = m.name || m.id || item.modelKey;
            const providerName = item.providerName;
            const releaseDate = m.release_date || m.last_updated || new Date().toISOString().slice(0, 10);
            const publishedAt = new Date(releaseDate).getTime();

            const contextTokens = m.limit?.context 
                ? (m.limit.context >= 1000000 ? `${(m.limit.context / 1000000).toFixed(1)}M` : `${Math.round(m.limit.context / 1024)}k`)
                : null;

            const modalities = Array.isArray(m.modalities?.input) ? m.modalities.input.join(', ') : 'texte';

            let costLabel = '';
            if (isFree) {
                costLabel = '🆓 Gratuit (0$/1M tokens)';
            } else if (cost.input != null && cost.output != null) {
                costLabel = `Entrée: $${cost.input}/1M • Sortie: $${cost.output}/1M`;
            } else {
                costLabel = 'Tarifs sur mesure';
            }

            const displayTitle = isFree 
                ? `🆓 [IA Gratuite] ${modelName} (${providerName})` 
                : `🤖 [Nouveau Modèle] ${modelName} (${providerName})`;

            const modelUrl = item.providerDoc || `https://models.dev/providers/${item.providerId}`;
            const tags = ['#ai', `#${item.providerId.replace(/[^a-z0-9]/g, '')}`];
            if (isFree) tags.push('#free', '#gratuit');
            if (m.reasoning) tags.push('#reasoning');
            if (m.open_weights) tags.push('#openweights');

            const descriptionParts = [
                m.description || `Nouveau modèle d'intelligence artificielle proposé par ${providerName}.`,
                `\n• **Fournisseur :** ${providerName}`,
                `• **Tarification :** ${costLabel}`,
                contextTokens ? `• **Fenêtre de contexte :** ${contextTokens} tokens` : null,
                `• **Modalités supportées :** ${modalities}`,
                m.reasoning ? '• **Capacité :** 🧠 Raisonnement avancé (Thinking)' : null,
                m.tool_call ? '• **Capacité :** 🛠️ Appel d\'outils (Tool Calling)' : null
            ].filter(Boolean);

            items.push({
                id: `modelsdev:${item.providerId}:${m.id || item.modelKey}`,
                guid: `modelsdev:${item.providerId}:${m.id || item.modelKey}`,
                title: displayTitle,
                link: modelUrl,
                url: modelUrl,
                author: providerName,
                content: descriptionParts.join('\n'),
                contentSnippet: (m.description || '').slice(0, 280),
                publishedAt,
                tags,
                source: 'models_dev',
                extra: {
                    providerId: item.providerId,
                    providerName,
                    modelId: m.id || item.modelKey,
                    modelName,
                    isFree,
                    costLabel,
                    contextTokens,
                    modalities,
                    reasoning: Boolean(m.reasoning),
                    toolCalling: Boolean(m.tool_call),
                    openWeights: Boolean(m.open_weights),
                    releaseDate
                }
            });

            if (items.length >= 25) break;
        }

        return items;
    }
}

module.exports = { AiModelsFeedProvider };
