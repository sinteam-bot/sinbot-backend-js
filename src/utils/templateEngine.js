/**
 * DiscordTemplateEngine
 * Moteur de templating Discord léger, sécurisé et isomorphe (style Twig / Handlebars / Liquid)
 * Supporte :
 *  - Variables imbriquées : {{ user.profile.name }}
 *  - Filtres chaînés : {{ score | number | bold }}
 *  - Conditions : {% if user.isVip %} ⭐ {% elif user.level > 10 %} 🥈 {% else %} 🥉 {% endif %}
 *  - Boucles avec loop context : {% for item in leaderboard %} {{ loop.index }}. {{ item.name }} {% endfor %}
 *  - Alias Handlebars : {{#if cond}}...{{else}}...{{/if}}, {{#each list}}...{{/each}}
 *  - Compilation d'Embeds Discord et validation des couleurs / structures
 */

class DiscordTemplateEngine {
    constructor() {
        this.filters = {};
        this.helpers = {};
        this.registerDefaultFilters();
    }

    /**
     * Enregistre un filtre personnalisé
     * @param {string} name
     * @param {Function} fn
     */
    registerFilter(name, fn) {
        this.filters[name.toLowerCase()] = fn;
    }

    /**
     * Enregistre les filtres par défaut
     */
    registerDefaultFilters() {
        // --- Chaînes & Markdown ---
        this.registerFilter('upper', val => String(val ?? '').toUpperCase());
        this.registerFilter('uppercase', val => String(val ?? '').toUpperCase());
        this.registerFilter('lower', val => String(val ?? '').toLowerCase());
        this.registerFilter('lowercase', val => String(val ?? '').toLowerCase());
        this.registerFilter('capitalize', val => {
            const str = String(val ?? '');
            return str.charAt(0).toUpperCase() + str.slice(1);
        });
        this.registerFilter('trim', val => String(val ?? '').trim());
        this.registerFilter('default', (val, fallback = '') => (val !== undefined && val !== null && val !== '') ? val : fallback);
        this.registerFilter('truncate', (val, length = 30, suffix = '...') => {
            const str = String(val ?? '');
            return str.length > length ? str.slice(0, length) + suffix : str;
        });
        this.registerFilter('replace', (val, search = '', replacement = '') => {
            return String(val ?? '').split(search).join(replacement);
        });

        // --- Styles Discord Markdown ---
        this.registerFilter('bold', val => val ? `**${val}**` : '');
        this.registerFilter('italic', val => val ? `*${val}*` : '');
        this.registerFilter('underline', val => val ? `__${val}__` : '');
        this.registerFilter('strikethrough', val => val ? `~~${val}~~` : '');
        this.registerFilter('spoiler', val => val ? `||${val}||` : '');
        this.registerFilter('code', val => val ? `\`${val}\`` : '');
        this.registerFilter('codeblock', (val, lang = '') => val ? `\`\`\`${lang}\n${val}\n\`\`\`` : '');
        this.registerFilter('quote', val => val ? String(val).split('\n').map(l => `> ${l}`).join('\n') : '');

        // --- Mentions & Discord Tags ---
        this.registerFilter('usermention', val => val ? `<@${String(val).replace(/[^0-9]/g, '')}>` : '');
        this.registerFilter('channelmention', val => val ? `<#${String(val).replace(/[^0-9]/g, '')}>` : '');
        this.registerFilter('rolemention', val => val ? `<@&${String(val).replace(/[^0-9]/g, '')}>` : '');
        this.registerFilter('emoji', (nameOrId, id) => {
            if (!nameOrId) return '';
            if (id) return `<:${nameOrId}:${id}>`;
            if (typeof nameOrId === 'string' && nameOrId.startsWith('<:') && nameOrId.endsWith('>')) return nameOrId;
            return nameOrId;
        });

        // --- Nombres ---
        this.registerFilter('number', (val, decimals = 0, sep = ' ') => {
            const num = Number(val);
            if (isNaN(num)) return val;
            const parts = num.toFixed(decimals).split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep);
            return parts.join(',');
        });
        this.registerFilter('round', (val, precision = 0) => {
            const num = Number(val);
            if (isNaN(num)) return val;
            const factor = Math.pow(10, precision);
            return Math.round(num * factor) / factor;
        });
        this.registerFilter('abs', val => Math.abs(Number(val) || 0));

        // --- Tableaux & Collections ---
        this.registerFilter('join', (val, sep = ', ') => Array.isArray(val) ? val.join(sep) : String(val ?? ''));
        this.registerFilter('first', val => Array.isArray(val) ? val[0] : (typeof val === 'string' ? val[0] : val));
        this.registerFilter('last', val => Array.isArray(val) ? val[val.length - 1] : (typeof val === 'string' ? val[val.length - 1] : val));
        this.registerFilter('length', val => Array.isArray(val) || typeof val === 'string' ? val.length : (val && typeof val === 'object' ? Object.keys(val).length : 0));
        this.registerFilter('slice', (val, start = 0, end) => Array.isArray(val) || typeof val === 'string' ? val.slice(start, end) : val);
        this.registerFilter('reverse', val => Array.isArray(val) ? [...val].reverse() : val);

        // --- Dates & Timestamps Discord ---
        this.registerFilter('date', (val, format = 'DD/MM/YYYY HH:mm') => {
            if (!val) return '';
            const d = new Date(val);
            if (isNaN(d.getTime())) return String(val);
            
            const pad = n => String(n).padStart(2, '0');
            const map = {
                'YYYY': d.getFullYear(),
                'YY': String(d.getFullYear()).slice(-2),
                'MM': pad(d.getMonth() + 1),
                'DD': pad(d.getDate()),
                'HH': pad(d.getHours()),
                'mm': pad(d.getMinutes()),
                'ss': pad(d.getSeconds())
            };

            let res = format;
            for (const [key, v] of Object.entries(map)) {
                res = res.replace(new RegExp(key, 'g'), v);
            }
            return res;
        });

        this.registerFilter('discordtimestamp', (val, style = 'R') => {
            if (!val) return '';
            const d = new Date(val);
            if (isNaN(d.getTime())) return String(val);
            const unix = Math.floor(d.getTime() / 1000);
            return `<t:${unix}:${style}>`;
        });

        this.registerFilter('timeago', val => {
            if (!val) return '';
            const d = new Date(val);
            if (isNaN(d.getTime())) return String(val);
            const now = Date.now();
            const diffSec = Math.floor((now - d.getTime()) / 1000);

            if (diffSec < 0) {
                // Futur
                const absSec = Math.abs(diffSec);
                if (absSec < 60) return `dans ${absSec}s`;
                if (absSec < 3600) return `dans ${Math.floor(absSec / 60)} min`;
                if (absSec < 86400) return `dans ${Math.floor(absSec / 3600)}h`;
                return `dans ${Math.floor(absSec / 86400)}j`;
            }

            if (diffSec < 60) return "à l'instant";
            if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
            if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)}h`;
            if (diffSec < 2592000) return `il y a ${Math.floor(diffSec / 86400)}j`;
            return `il y a ${Math.floor(diffSec / 2592000)} mois`;
        });
    }

    /**
     * Résout une valeur imbriquée dans un contexte (ex: 'user.profile.name')
     * @param {string} path
     * @param {object} context
     * @returns {*}
     */
    resolvePath(path, context) {
        if (!path || context === undefined || context === null) return undefined;
        const cleanPath = path.trim();

        // Littéraux
        if (cleanPath === 'true') return true;
        if (cleanPath === 'false') return false;
        if (cleanPath === 'null') return null;
        if (cleanPath === 'undefined') return undefined;
        if (/^-?\d+(\.\d+)?$/.test(cleanPath)) return Number(cleanPath);
        if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) || (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
            return cleanPath.slice(1, -1);
        }

        // Accès aux clés imbriquées (point ou crochets)
        const parts = cleanPath
            .replace(/\[(\w+)\]/g, '.$1')
            .replace(/\["([^"]+)"\]/g, '.$1')
            .replace(/\['([^']+)'\]/g, '.$1')
            .split('.');

        let current = context;
        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
        }
        return current;
    }

    /**
     * Évalue une expression conditionnelle de manière sécurisée
     * @param {string} expr
     * @param {object} context
     * @returns {boolean}
     */
    evaluateCondition(expr, context) {
        if (!expr) return false;
        const cleanExpr = expr.trim();

        // Support du "not" ou "!" au début
        if (cleanExpr.startsWith('!') || cleanExpr.toLowerCase().startsWith('not ')) {
            const sub = cleanExpr.startsWith('!') ? cleanExpr.slice(1) : cleanExpr.slice(4);
            return !this.evaluateCondition(sub, context);
        }

        // Opérateurs logiques composés : '&&' ou 'and', '||' ou 'or'
        if (cleanExpr.includes('&&') || /\band\b/i.test(cleanExpr)) {
            const subParts = cleanExpr.split(/&&|\band\b/i);
            return subParts.every(p => this.evaluateCondition(p, context));
        }

        if (cleanExpr.includes('||') || /\bor\b/i.test(cleanExpr)) {
            const subParts = cleanExpr.split(/\|\||\bor\b/i);
            return subParts.some(p => this.evaluateCondition(p, context));
        }

        // Opérateurs de comparaison
        const compRegex = /^(.+?)\s*(===|==|!==|!=|>=|<=|>|<|\bin\b)\s*(.+)$/;
        const match = cleanExpr.match(compRegex);

        if (match) {
            const left = this.resolvePath(match[1], context);
            const op = match[2].trim().toLowerCase();
            const right = this.resolvePath(match[3], context);

            switch (op) {
                case '==':
                case '===':
                    return left == right;
                case '!=':
                case '!==':
                    return left != right;
                case '>':
                    return Number(left) > Number(right);
                case '<':
                    return Number(left) < Number(right);
                case '>=':
                    return Number(left) >= Number(right);
                case '<=':
                    return Number(left) <= Number(right);
                case 'in':
                    if (Array.isArray(right)) return right.includes(left);
                    if (typeof right === 'string') return right.includes(String(left));
                    if (right && typeof right === 'object') return left in right;
                    return false;
            }
        }

        // Condition simple (vérité de la variable)
        const val = this.resolvePath(cleanExpr, context);
        return Boolean(val && (!Array.isArray(val) || val.length > 0));
    }

    /**
     * Évalue une expression avec filtres (ex: "user.score | number(2) | bold")
     * @param {string} expr
     * @param {object} context
     * @returns {*}
     */
    evaluateExpression(expr, context) {
        if (!expr) return '';
        const parts = expr.split('|').map(p => p.trim());
        const varPath = parts[0];
        let value = this.resolvePath(varPath, context);

        for (let i = 1; i < parts.length; i++) {
            const filterCall = parts[i];
            // Format filtre : "name" ou "name(arg1, arg2)"
            const callMatch = filterCall.match(/^([a-zA-Z0-9_-]+)(?:\((.*)\))?$/);
            if (!callMatch) continue;

            const filterName = callMatch[1].toLowerCase();
            const filterFn = this.filters[filterName];

            if (typeof filterFn === 'function') {
                const rawArgs = callMatch[2] ? this.parseArgs(callMatch[2], context) : [];
                value = filterFn(value, ...rawArgs);
            }
        }

        return value !== undefined && value !== null ? value : '';
    }

    /**
     * Découpe les arguments passés à un filtre
     * @param {string} argsStr
     * @param {object} context
     * @returns {Array}
     */
    parseArgs(argsStr, context) {
        const args = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < argsStr.length; i++) {
            const char = argsStr[i];
            if ((char === '"' || char === "'") && (i === 0 || argsStr[i - 1] !== '\\')) {
                if (!inQuotes) {
                    inQuotes = true;
                    quoteChar = char;
                } else if (char === quoteChar) {
                    inQuotes = false;
                }
                current += char;
            } else if (char === ',' && !inQuotes) {
                args.push(this.resolvePath(current.trim(), context));
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            args.push(this.resolvePath(current.trim(), context));
        }

        return args;
    }

    /**
     * Normalise les syntaxes Handlebars vers la syntaxe interne unifiée
     * @param {string} template
     * @returns {string}
     */
    normalizeTemplate(template) {
        if (!template || typeof template !== 'string') return '';

        let res = template;

        // Alias Handlebars pour conditions : {{#if cond}} ... {{else}} ... {{/if}}
        res = res.replace(/\{\{#if\s+([^}]+)\}\}/g, '{% if $1 %}');
        res = res.replace(/\{\{else\}\}/g, '{% else %}');
        res = res.replace(/\{\{\/if\}\}/g, '{% endif %}');

        // Alias Handlebars pour boucles : {{#each list as item}} ou {{#each list}} ... {{/each}}
        res = res.replace(/\{\{#each\s+([^\s}]+)(?:\s+as\s+([^\s}]+))?\}\}/g, (match, list, item) => {
            const itemName = item || 'this';
            return `{% for ${itemName} in ${list} %}`;
        });
        res = res.replace(/\{\{\/each\}\}/g, '{% endfor %}');

        return res;
    }

    /**
     * Rend une chaîne de template avec un contexte de données
     * @param {string} template
     * @param {object} context
     * @returns {string}
     */
    render(template, context = {}) {
        if (!template || typeof template !== 'string') return '';

        const normalized = this.normalizeTemplate(template);
        return this.renderBlock(normalized, context);
    }

    /**
     * Rend récursivement les blocs de template (conditions, boucles, interpolations)
     * @param {string} content
     * @param {object} context
     * @returns {string}
     */
    renderBlock(content, context) {
        let output = content;

        // 1. Traitement des boucles {% for item in list %} ... {% endfor %}
        const forLoopRegex = /\{%\s*for\s+([a-zA-Z0-9_]+)\s+in\s+([a-zA-Z0-9_.[\]]+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;
        output = output.replace(forLoopRegex, (match, itemVar, listPath, body) => {
            const list = this.resolvePath(listPath, context);
            if (!Array.isArray(list) || list.length === 0) return '';

            return list.map((item, index) => {
                const itemContext = {
                    ...context,
                    [itemVar]: item,
                    this: item,
                    loop: {
                        index: index + 1,
                        index0: index,
                        first: index === 0,
                        last: index === list.length - 1,
                        length: list.length,
                        even: index % 2 === 0,
                        odd: index % 2 !== 0
                    }
                };
                return this.renderBlock(body, itemContext);
            }).join('');
        });

        // 2. Traitement des conditions {% if cond %} ... {% elif cond %} ... {% else %} ... {% endif %}
        const ifBlockRegex = /\{%\s*if\s+([^%]+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
        output = output.replace(ifBlockRegex, (match, initialCond, fullBody) => {
            // Découpage en branches (if / elif / else)
            const branches = [];
            let currentCond = initialCond;
            let currentBody = '';

            const parts = fullBody.split(/\{%\s*(elif|else)\s*([^%]*)\s*%\}/);
            // parts[0] = body de if
            // parts[1] = 'elif' ou 'else'
            // parts[2] = condition si elif
            // parts[3] = body de elif/else...

            branches.push({ cond: initialCond, body: parts[0] });

            for (let i = 1; i < parts.length; i += 3) {
                const type = parts[i];
                const cond = type === 'elif' ? parts[i + 1] : 'true';
                const body = parts[i + 2] || '';
                branches.push({ cond, body });
            }

            for (const branch of branches) {
                if (this.evaluateCondition(branch.cond, context)) {
                    return this.renderBlock(branch.body, context);
                }
            }

            return '';
        });

        // 3. Interpolation des variables simples et filtres {{ expr }}
        const varRegex = /\{\{\s*([^}]+)\s*\}\}/g;
        output = output.replace(varRegex, (match, expr) => {
            const res = this.evaluateExpression(expr, context);
            return res !== undefined && res !== null ? String(res) : '';
        });

        return output;
    }

    /**
     * Résout une couleur Discord (Hex, nommée, ou entier)
     * @param {*} color
     * @returns {number|null}
     */
    resolveColor(color) {
        if (!color) return null;
        if (typeof color === 'number') return color;

        const colorStr = String(color).trim();

        const namedColors = {
            'BLURPLE': 0x5865F2,
            'GREEN': 0x57F287,
            'YELLOW': 0xFEE75C,
            'FUCHSIA': 0xEB459E,
            'RED': 0xED4245,
            'WHITE': 0xFFFFFF,
            'BLACK': 0x000000,
            'NAVY': 0x34495E,
            'GOLD': 0xF1C40F,
            'ORANGE': 0xE67E22,
            'PURPLE': 0x9B59B6,
            'AQUA': 0x1ABC9C,
            'DARK_BUT_NOT_BLACK': 0x2C2F33
        };

        const upperName = colorStr.toUpperCase();
        if (namedColors[upperName]) return namedColors[upperName];

        // Format Hex : #5865F2 ou 0x5865F2 ou 5865F2
        const cleanHex = colorStr.replace(/^#|^0x/, '');
        if (/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
            return parseInt(cleanHex, 16);
        }

        return null;
    }

    /**
     * Compile un template complet de message Discord (content + embeds)
     * @param {object|string} templateConfig
     * @param {object} context
     * @returns {{ content: string, embeds: Array<object>, allowedMentions?: object }}
     */
    renderDiscordMessage(templateConfig, context = {}) {
        if (!templateConfig) return { content: '', embeds: [] };

        // Si string simple
        if (typeof templateConfig === 'string') {
            return {
                content: this.render(templateConfig, context),
                embeds: []
            };
        }

        const result = {
            content: this.render(templateConfig.content || '', context).trim(),
            embeds: []
        };

        const rawEmbeds = templateConfig.embeds || (templateConfig.embed ? [templateConfig.embed] : []);

        for (const rawEmbed of rawEmbeds) {
            if (!rawEmbed || typeof rawEmbed !== 'object') continue;

            const embed = {};

            // Titre & URL
            if (rawEmbed.title) embed.title = this.render(rawEmbed.title, context).trim();
            if (rawEmbed.url) embed.url = this.render(rawEmbed.url, context).trim();

            // Description
            if (rawEmbed.description) embed.description = this.render(rawEmbed.description, context).trim();

            // Couleur
            if (rawEmbed.color) {
                const evaluatedColor = this.render(String(rawEmbed.color), context).trim();
                const resolvedColor = this.resolveColor(evaluatedColor);
                if (resolvedColor !== null) embed.color = resolvedColor;
            }

            // Timestamp
            if (rawEmbed.timestamp) {
                if (rawEmbed.timestamp === true || rawEmbed.timestamp === 'now' || rawEmbed.timestamp === '{{ now }}') {
                    embed.timestamp = new Date().toISOString();
                } else {
                    const parsedTs = this.render(String(rawEmbed.timestamp), context).trim();
                    const d = new Date(parsedTs);
                    embed.timestamp = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
                }
            }

            // Auteur
            if (rawEmbed.author) {
                const author = {};
                if (rawEmbed.author.name) author.name = this.render(rawEmbed.author.name, context).trim();
                if (rawEmbed.author.icon_url || rawEmbed.author.iconUrl) {
                    author.icon_url = this.render(rawEmbed.author.icon_url || rawEmbed.author.iconUrl, context).trim();
                }
                if (rawEmbed.author.url) author.url = this.render(rawEmbed.author.url, context).trim();
                if (author.name) embed.author = author;
            }

            // Pied de page (Footer)
            if (rawEmbed.footer) {
                const footer = {};
                if (rawEmbed.footer.text) footer.text = this.render(rawEmbed.footer.text, context).trim();
                if (rawEmbed.footer.icon_url || rawEmbed.footer.iconUrl) {
                    footer.icon_url = this.render(rawEmbed.footer.icon_url || rawEmbed.footer.iconUrl, context).trim();
                }
                if (footer.text) embed.footer = footer;
            }

            // Image & Miniature
            if (rawEmbed.image) {
                const imgUrl = typeof rawEmbed.image === 'string' ? rawEmbed.image : (rawEmbed.image.url || '');
                const renderedUrl = this.render(imgUrl, context).trim();
                if (renderedUrl) embed.image = { url: renderedUrl };
            }

            if (rawEmbed.thumbnail) {
                const thumbUrl = typeof rawEmbed.thumbnail === 'string' ? rawEmbed.thumbnail : (rawEmbed.thumbnail.url || '');
                const renderedUrl = this.render(thumbUrl, context).trim();
                if (renderedUrl) embed.thumbnail = { url: renderedUrl };
            }

            // Champs (Fields)
            if (Array.isArray(rawEmbed.fields) && rawEmbed.fields.length > 0) {
                embed.fields = [];
                for (const field of rawEmbed.fields) {
                    const name = this.render(field.name || '', context).trim();
                    const value = this.render(field.value || '', context).trim();
                    if (name && value) {
                        embed.fields.push({
                            name,
                            value,
                            inline: Boolean(field.inline)
                        });
                    }
                }
            }

            // N'ajouter l'embed que s'il contient au moins une information
            if (
                embed.title ||
                embed.description ||
                (embed.fields && embed.fields.length > 0) ||
                embed.image ||
                embed.thumbnail ||
                embed.author ||
                embed.footer
            ) {
                result.embeds.push(embed);
            }
        }

        return result;
    }
}

const templateEngine = new DiscordTemplateEngine();
module.exports = templateEngine;
module.exports.DiscordTemplateEngine = DiscordTemplateEngine;
