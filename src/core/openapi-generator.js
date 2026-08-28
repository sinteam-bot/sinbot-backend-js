/**
 * src/core/openapi-generator.js
 *
 * Générateur et extracteur automatique de spécification OpenAPI 3.1.0.
 * Introspecte dynamiquement les contrôleurs ModuleManager (@Controller)
 * et la pile de routage Express (webRouter, authRouter, featuresRouter, webhook).
 */

const fs = require('fs');
const path = require('path');

class OpenApiGenerator {
    constructor(options = {}) {
        this.options = {
            title: options.title || 'Bot Discord API',
            version: options.version || '1.0.0',
            description: options.description || 'Spécification OpenAPI 3.1 générée automatiquement depuis les modules et routeurs Express du bot.',
            basePath: options.basePath || '/',
            ...options
        };
    }

    /**
     * Génère la spécification OpenAPI complète
     * @param {Object} context - { app, moduleManager, client, config }
     * @returns {Object} Spécification OpenAPI 3.1.0
     */
    generateSpec({ app, moduleManager, client = null, config = {} } = {}) {
        const paths = {};
        const tagsMap = new Map();

        // 1. Introspection des contrôleurs modulaires (@Controller)
        if (moduleManager && Array.isArray(moduleManager.modules)) {
            this._inspectModuleControllers(moduleManager, paths, tagsMap);
        }

        // 2. Introspection de la pile de routage Express (compatible Express 4 et Express 5)
        const stack = app?.router?.stack || app?._router?.stack;
        if (Array.isArray(stack)) {
            this._inspectExpressRouter(stack, '', paths, tagsMap);
        }

        // Trier les tags et les chemins
        const tags = Array.from(tagsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

        const spec = {
            openapi: '3.1.0',
            info: {
                title: this.options.title,
                version: this.options.version,
                description: this.options.description,
                contact: {
                    name: 'Bot Support',
                    url: 'https://github.com/sinteam-bot/chienne-bot'
                }
            },
            servers: [
                {
                    url: 'http://localhost:3000',
                    description: 'Serveur Express local'
                },
                {
                    url: '/',
                    description: 'Serveur courant'
                }
            ],
            tags,
            paths: this._sortPaths(paths),
            components: {
                securitySchemes: {
                    ApiKeyAuth: {
                        type: 'apiKey',
                        in: 'header',
                        name: 'x-api-key',
                        description: 'Clé API secrète du dashboard (paramètre security.api_key)'
                    },
                    BearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'Token JWT d\'authentification OAuth2 Discord'
                    }
                },
                schemas: {
                    ApiResponse: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean', example: true },
                            data: { type: 'object' },
                            error: { type: 'string', nullable: true }
                        }
                    },
                    ErrorResponse: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean', example: false },
                            error: { type: 'string', example: 'Message d\'erreur explicite' }
                        }
                    },
                    PaginationMeta: {
                        type: 'object',
                        properties: {
                            total: { type: 'integer', example: 100 },
                            page: { type: 'integer', example: 1 },
                            limit: { type: 'integer', example: 50 },
                            pages: { type: 'integer', example: 2 }
                        }
                    }
                }
            }
        };

        return spec;
    }

    /**
     * Sauvegarde la spécification OpenAPI dans un fichier JSON
     * @param {string} targetPath - Chemin absolu ou relatif du fichier
     * @param {Object} spec - Objet OpenAPI généré
     */
    exportToFile(targetPath, spec) {
        try {
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(targetPath, JSON.stringify(spec, null, 2), 'utf8');
            return true;
        } catch (err) {
            console.error(`❌ [OpenApiGenerator] Erreur lors de l'écriture de ${targetPath}:`, err.message);
            return false;
        }
    }

    /**
     * Introspection des contrôleurs déclarés dans les modules
     * @private
     */
    _inspectModuleControllers(moduleManager, paths, tagsMap) {
        for (const mod of moduleManager.modules) {
            const controllers = mod.metadata?.controllers || [];
            for (const ControllerClass of controllers) {
                const prefix = ControllerClass.__controllerPrefix || '';
                const routes = ControllerClass.__routes || [];

                for (const route of routes) {
                    const fullPath = this._cleanPath(`${prefix}${route.path}`);
                    const openApiPath = this._expressToOpenApiPath(fullPath);
                    const method = route.method.toLowerCase();
                    const tag = this._inferTag(fullPath, mod.name);

                    if (!tagsMap.has(tag)) {
                        tagsMap.set(tag, { name: tag, description: `Endpoints du module ${tag}` });
                    }

                    if (!paths[openApiPath]) {
                        paths[openApiPath] = {};
                    }

                    const pathParams = this._extractPathParameters(openApiPath);
                    const queryParams = this._inferQueryParams(fullPath, method, route.handlerName);

                    paths[openApiPath][method] = {
                        tags: [tag],
                        summary: this._formatSummary(route.handlerName, method, fullPath),
                        description: `Gestionnaire: \`${ControllerClass.name}.${route.handlerName}\``,
                        operationId: `${ControllerClass.name}_${route.handlerName}`,
                        parameters: [...pathParams, ...queryParams],
                        security: this._inferSecurity(fullPath),
                        responses: this._generateDefaultResponses(method)
                    };

                    if (['post', 'put', 'patch'].includes(method)) {
                        paths[openApiPath][method].requestBody = this._generateDefaultRequestBody(fullPath, route.handlerName);
                    }
                }
            }
        }
    }

    /**
     * Introspection récursive des Layers Express Router
     * @private
     */
    _inspectExpressRouter(stack, basePath, paths, tagsMap) {
        for (const layer of stack) {
            if (layer.route) {
                // Route directe
                const route = layer.route;
                const routePath = this._cleanPath(`${basePath}${route.path}`);
                const openApiPath = this._expressToOpenApiPath(routePath);
                const tag = this._inferTag(routePath);

                if (!tagsMap.has(tag)) {
                    tagsMap.set(tag, { name: tag, description: `Endpoints de ${tag}` });
                }

                if (!paths[openApiPath]) {
                    paths[openApiPath] = {};
                }

                for (const [method, active] of Object.entries(route.methods)) {
                    if (!active) continue;
                    const m = method.toLowerCase();
                    if (paths[openApiPath][m]) continue; // Déjà enregistré par un contrôleur

                    const pathParams = this._extractPathParameters(openApiPath);
                    const queryParams = this._inferQueryParams(routePath, m);

                    paths[openApiPath][m] = {
                        tags: [tag],
                        summary: this._formatSummary(null, m, routePath),
                        description: `Route Express: \`${m.toUpperCase()} ${routePath}\``,
                        parameters: [...pathParams, ...queryParams],
                        security: this._inferSecurity(routePath),
                        responses: this._generateDefaultResponses(m)
                    };

                    if (['post', 'put', 'patch'].includes(m)) {
                        paths[openApiPath][m].requestBody = this._generateDefaultRequestBody(routePath);
                    }
                }
            } else if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
                // Sous-routeur Express
                const subPrefix = this._extractPrefix(layer);
                this._inspectExpressRouter(layer.handle.stack, `${basePath}${subPrefix}`, paths, tagsMap);
            }
        }
    }

    /**
     * Convertit `/api/users/:userId` en `/api/users/{userId}`
     * @private
     */
    _expressToOpenApiPath(expressPath) {
        return expressPath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
    }

    /**
     * Nettoie les doubles slashes et slashes terminaux
     * @private
     */
    _cleanPath(p) {
        let cleaned = p.replace(/\/+/g, '/');
        if (cleaned.length > 1 && cleaned.endsWith('/')) {
            cleaned = cleaned.slice(0, -1);
        }
        return cleaned || '/';
    }

    /**
     * Extrait les paramètres de chemin OpenAPI `{param}`
     * @private
     */
    _extractPathParameters(openApiPath) {
        const matches = openApiPath.match(/{([^}]+)}/g) || [];
        return matches.map(m => {
            const name = m.slice(1, -1);
            return {
                name,
                in: 'path',
                required: true,
                description: `Identifiant ${name}`,
                schema: {
                    type: 'string'
                }
            };
        });
    }

    /**
     * Déduit les paramètres de requête selon le chemin et la méthode
     * @private
     */
    _inferQueryParams(fullPath, method, handlerName = '') {
        const params = [];
        if (method !== 'get') return params;

        if (fullPath.includes('/logs') || fullPath.includes('/history') || fullPath.includes('/list') || fullPath.includes('/leaderboard')) {
            params.push(
                { name: 'guild_id', in: 'query', required: false, schema: { type: 'string' }, description: 'Identifiant du serveur Discord (optionnel)' },
                { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 }, description: 'Nombre maximum d\'éléments' },
                { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 }, description: 'Numéro de page' }
            );
        } else if (fullPath.startsWith('/api/')) {
            params.push(
                { name: 'guild_id', in: 'query', required: false, schema: { type: 'string' }, description: 'Identifiant du serveur Discord' }
            );
        }

        if (fullPath.includes('/messages') || fullPath.includes('/stats')) {
            params.push({ name: 'days', in: 'query', required: false, schema: { type: 'integer', default: 7 }, description: 'Période en jours' });
        }

        return params;
    }

    /**
     * Déduit les règles de sécurité applicables
     * @private
     */
    _inferSecurity(fullPath) {
        if (fullPath.startsWith('/api/auth/discord') || fullPath === '/api/docs' || fullPath.startsWith('/api/docs/')) {
            return []; // Endpoints publics
        }
        return [
            { ApiKeyAuth: [] },
            { BearerAuth: [] }
        ];
    }

    /**
     * Déduit le tag / catégorie d'une route
     * @private
     */
    _inferTag(fullPath, moduleName = null) {
        if (fullPath.startsWith('/api/auth')) return 'Authentication';
        if (fullPath.startsWith('/api/logs')) return 'Audit Logs';
        if (fullPath.startsWith('/api/stats')) return 'Statistics & KPIs';
        if (fullPath.startsWith('/api/automod')) return 'AutoMod';
        if (fullPath.startsWith('/api/tickets')) return 'Tickets';
        if (fullPath.startsWith('/api/economy') || fullPath.startsWith('/api/inventory') || fullPath.startsWith('/api/shop')) return 'Economy & Inventory';
        if (fullPath.startsWith('/api/temp-voice')) return 'Temp Voice';
        if (fullPath.startsWith('/api/birthdays')) return 'Birthdays';
        if (fullPath.startsWith('/api/reaction-roles')) return 'Reaction Roles';
        if (fullPath.startsWith('/api/reports')) return 'Reports';
        if (fullPath.startsWith('/api/sticky-roles')) return 'Sticky Roles';
        if (fullPath.startsWith('/api/info')) return 'Server & User Info';
        if (fullPath.startsWith('/api/engagement-advanced') || fullPath.startsWith('/api/engagement')) return 'Engagement & Reminders';
        if (fullPath.startsWith('/api/security-question')) return 'Security Captcha';
        if (fullPath.startsWith('/api/xp')) return 'XP & Levels';
        if (fullPath.startsWith('/api/daily-message')) return 'Daily Message';
        if (fullPath.startsWith('/api/welcome')) return 'Welcome System';
        if (fullPath.startsWith('/api/bump')) return 'Bump Reminders';
        if (fullPath.startsWith('/api/features')) return 'Feature Flags';
        if (fullPath.startsWith('/api/config')) return 'Configuration';
        if (fullPath.startsWith('/api/notifier')) return 'Startup Notifier';
        if (fullPath.startsWith('/webhook')) return 'Webhooks (n8n / External)';

        if (moduleName) {
            return moduleName.replace(/Module$/, '').replace(/^feature_/, '');
        }

        return 'General API';
    }

    /**
     * Formate un résumé lisible pour l'opération
     * @private
     */
    _formatSummary(handlerName, method, fullPath) {
        if (handlerName) {
            const readable = handlerName
                .replace(/([A-Z])/g, ' $1')
                .toLowerCase()
                .trim();
            return readable.charAt(0).toUpperCase() + readable.slice(1);
        }
        return `${method.toUpperCase()} ${fullPath}`;
    }

    /**
     * Génère les réponses HTTP par défaut
     * @private
     */
    _generateDefaultResponses(method) {
        const isCreation = method === 'post';
        return {
            [isCreation ? '201' : '200']: {
                description: isCreation ? 'Ressource créée avec succès' : 'Opération réussie',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ApiResponse'
                        }
                    }
                }
            },
            '400': {
                description: 'Requête invalide ou paramètre manquant',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ErrorResponse'
                        }
                    }
                }
            },
            '401': {
                description: 'Non authentifié (clé API ou token manquant/invalide)'
            },
            '403': {
                description: 'Accès refusé (permissions insuffisantes / IP bloquée)'
            },
            '500': {
                description: 'Erreur interne du serveur'
            }
        };
    }

    /**
     * Génère le corps de requête par défaut pour POST/PUT/PATCH
     * @private
     */
    _generateDefaultRequestBody(fullPath, handlerName = '') {
        return {
            required: true,
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        description: `Données JSON pour ${fullPath}`
                    }
                }
            }
        };
    }

    /**
     * Extrait le préfixe d'un Layer Express Router
     * @private
     */
    _extractPrefix(layer) {
        if (!layer) return '';
        if (layer.path) return layer.path;
        if (layer.regexp) {
            const str = layer.regexp.toString();
            const match = str.match(/^\/\^\\\/([a-zA-Z0-9_\-\\\/]+?)\\\//);
            if (match && match[1]) return '/' + match[1].replace(/\\/g, '');
            const fastMatch = str.match(/^\/\^([a-zA-Z0-9_\-\/]+)/);
            if (fastMatch && fastMatch[1]) return fastMatch[1].replace(/\\/g, '');
        }
        if (typeof layer.match === 'function') {
            const candidates = [
                '/api/engagement-advanced',
                '/api/security-question',
                '/api/reaction-roles',
                '/api/sticky-roles',
                '/api/daily-message',
                '/api/temp-voice',
                '/api/birthdays',
                '/api/features',
                '/api/notifier',
                '/api/automod',
                '/api/economy',
                '/api/tickets',
                '/api/reports',
                '/api/welcome',
                '/api/config',
                '/api/stats',
                '/api/cards',
                '/api/bump',
                '/api/auth',
                '/api/info',
                '/api/logs',
                '/api/docs',
                '/api/xp',
                '/api',
                '/webhook'
            ];
            for (const cand of candidates) {
                if (layer.match(cand)) {
                    const isSub = candidates.some(shorter => shorter.length < cand.length && cand.startsWith(shorter) && layer.match(shorter));
                    if (!isSub) return cand;
                }
            }
        }
        return '';
    }

    /**
     * Trie les chemins alphabétiquement
     * @private
     */
    _sortPaths(paths) {
        const sorted = {};
        Object.keys(paths).sort().forEach(key => {
            sorted[key] = paths[key];
        });
        return sorted;
    }

    /**
     * Génère l'interface web interactive Scalar pour OpenAPI
     * @param {Object} opts - { title, specUrl }
     * @returns {string} HTML autonome
     */
    getScalarHtml(opts = {}) {
        const title = opts.title || this.options.title;
        const specUrl = opts.specUrl || '/api/docs/openapi.json';

        return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Documentation API</title>
  <link rel="icon" type="image/png" href="https://cdn.discordapp.com/embed/avatars/0.png" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
  </style>
</head>
<body>
  <script
    id="api-reference"
    data-url="${specUrl}"
    data-configuration='{"theme": "purple", "darkMode": true, "showSidebar": true}'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/dist/browser/standalone.js"></script>
</body>
</html>`;
    }
}

module.exports = { OpenApiGenerator };
