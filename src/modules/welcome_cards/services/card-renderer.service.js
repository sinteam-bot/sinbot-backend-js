/**
 * CardRendererService — moteur de génération de cartes SVG
 *
 * Service **réutilisable** par toutes les features qui ont besoin
 * d'une image (welcome, level-up, giveaway, join/leave, custom).
 *
 * Choix de design :
 *  - SVG pur (pas de dépendance native Cairo/pango/canvas)
 *  - Discord.js accepte les attachments SVG directement
 *  - Le front peut afficher du SVG natif (UserCard.vue)
 *  - Templates déclaratifs (template literal) pour rester
 *    composables et customizables
 *  - Cache BDD par (guild_id, user_id, template) + payload
 *
 * API publique :
 *  - render(templateName, payload)  -> { svg, payloadHash }
 *  - renderToBuffer(templateName, payload) -> Buffer
 *  - listTemplates()                -> string[]
 *  - registerTemplate(name, fn)     -> void
 */

const crypto = require('crypto');

class CardRendererService {
    static inject = [];

    constructor() {
        this._templates = new Map();
        this._cache = new Map(); // in-memory cache (mirror of DB)
        this._defaultSize = { width: 1024, height: 512 };
        this._registerBuiltinTemplates();
    }

    /**
     * Enregistre un template custom
     * @param {string} name
     * @param {(payload: object, options: { width, height }) => string} fn
     *   doit retourner une chaîne SVG complète
     */
    registerTemplate(name, fn) {
        this._templates.set(name, fn);
    }

    listTemplates() {
        return Array.from(this._templates.keys());
    }

    /**
     * Génère le SVG pour un template + payload
     */
    render(templateName, payload = {}, options = {}) {
        const tpl = this._templates.get(templateName);
        if (!tpl) {
            throw new Error(`Template inconnu: "${templateName}". Disponibles: ${this.listTemplates().join(', ')}`);
        }
        const width = options.width || this._defaultSize.width;
        const height = options.height || this._defaultSize.height;
        const safePayload = this._sanitizePayload(payload);
        return tpl(safePayload, { width, height });
    }

    /**
     * Rend un SVG et le retourne en Buffer
     */
    renderToBuffer(templateName, payload = {}, options = {}) {
        return Buffer.from(this.render(templateName, payload, options), 'utf-8');
    }

    /**
     * Hash déterministe du payload (utilisé pour le cache BDD)
     */
    hashPayload(payload) {
        return crypto.createHash('sha1')
            .update(JSON.stringify(this._sanitizePayload(payload)))
            .digest('hex')
            .slice(0, 16);
    }

    _sanitizePayload(payload) {
        const out = {};
        for (const [k, v] of Object.entries(payload)) {
            if (typeof v === 'string') {
                out[k] = v.length > 200 ? v.slice(0, 197) + '...' : v;
            } else if (typeof v === 'number') {
                out[k] = v;
            } else if (typeof v === 'boolean') {
                out[k] = v ? 1 : 0;
            } else if (v && typeof v === 'object') {
                out[k] = this._sanitizePayload(v);
            } else {
                out[k] = v;
            }
        }
        return out;
    }

    _escapeXml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Helpers de construction SVG partagés entre templates
     */
    _defs(extra = '') {
        return `<defs>
  <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#1e1f22"/>
    <stop offset="100%" stop-color="#2b2d31"/>
  </linearGradient>
  <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#5865f2"/>
    <stop offset="100%" stop-color="#eb459e"/>
  </linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
  </filter>
  ${extra}
</defs>`;
    }

    _wrap(content, { width, height, bg = true }) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
${bg ? `<rect width="100%" height="100%" fill="url(#bg)"/>` : ''}
${content}
</svg>`;
    }

    _avatarCircle({ cx = 512, cy = 200, radius = 80, url }) {
        if (!url) {
            return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#3f4147"/><text x="${cx}" y="${cy + 8}" text-anchor="middle" fill="#80848e" font-size="24" font-family="sans-serif">?</text>`;
        }
        return `
<defs>
  <clipPath id="avatar-clip">
    <circle cx="${cx}" cy="${cy}" r="${radius}"/>
  </clipPath>
</defs>
<image href="${this._escapeXml(url)}" x="${cx - radius}" y="${cy - radius}" width="${radius * 2}" height="${radius * 2}" clip-path="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice"/>
<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="url(#accent)" stroke-width="4"/>`;
    }

    _progressBar({ x, y, width, height, percent, fillColor = 'url(#accent)', bgColor = '#3f4147' }) {
        const clamped = Math.max(0, Math.min(100, percent || 0));
        const filled = (width * clamped) / 100;
        return `
<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${bgColor}"/>
<rect x="${x}" y="${y}" width="${filled}" height="${height}" rx="${height / 2}" fill="${fillColor}"/>
<text x="${x + width / 2}" y="${y + height + 20}" text-anchor="middle" fill="#b5bac1" font-size="14" font-family="sans-serif">${clamped.toFixed(0)}%</text>`;
    }

    _text({ x, y, content, size = 24, color = '#f2f3f5', anchor = 'start', weight = 'normal', family = 'sans-serif' }) {
        return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-size="${size}" font-weight="${weight}" font-family="${family}">${this._escapeXml(content)}</text>`;
    }

    /**
     * Construit un fond gradienté à partir de deux couleurs
     */
    _gradientBackground(c1 = '#5865f2', c2 = '#eb459e') {
        return `<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>`;
    }

    /**
     * Templates built-in
     */
    _registerBuiltinTemplates() {
        // ============== WELCOME ==============
        this.registerTemplate('welcome', (p, { width, height }) => {
            const title = p.title || 'Bienvenue !';
            const subtitle = p.customSubtitle || p.subtitle || `${p.username || 'Nouveau membre'} rejoint ${p.server || 'le serveur'}`;
            const memberNumber = p.memberCount || '';
            const c1 = p.primaryColor || '#5865f2';
            const c2 = p.accentColor || '#f2c7ce';
            const textCol = p.textColor || '#ffffff';

            const bgImage = p.backgroundUrl
                ? `<image href="${this._escapeXml(p.backgroundUrl)}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/><rect width="100%" height="100%" fill="rgba(0,0,0,0.5)"/>`
                : `<rect width="100%" height="100%" fill="url(#bg)"/>`;

            return this._wrap(`
${this._gradientBackground(c1, c2)}
${this._defs()}
${bgImage}
${this._avatarCircle({ url: p.avatarUrl, radius: 90 })}
${this._text({ x: width / 2, y: 340, content: title, size: 48, color: textCol, anchor: 'middle', weight: 'bold' })}
${this._text({ x: width / 2, y: 400, content: subtitle, size: 24, color: textCol, anchor: 'middle' })}
${memberNumber ? this._text({ x: width / 2, y: 450, content: `Membre #${memberNumber}`, size: 18, color: textCol, anchor: 'middle' }) : ''}
<rect x="${width / 2 - 40}" y="470" width="80" height="3" fill="${textCol}" opacity="0.5"/>
`, { width, height, bg: false });
        });

        // ============== JOIN ==============
        this.registerTemplate('join', (p, { width, height }) => {
            return this._wrap(`
${this._gradientBackground('#57f287', '#5865f2')}
${this._defs()}
<rect width="100%" height="100%" fill="url(#bg)"/>
${this._avatarCircle({ url: p.avatarUrl, radius: 80 })}
${this._text({ x: width / 2, y: 340, content: '➕ Nouveau membre', size: 28, color: 'rgba(255,255,255,0.7)', anchor: 'middle' })}
${this._text({ x: width / 2, y: 400, content: p.username || 'Un nouveau membre', size: 42, color: '#ffffff', anchor: 'middle', weight: 'bold' })}
${p.memberCount ? this._text({ x: width / 2, y: 450, content: `Membre #${p.memberCount}`, size: 18, color: 'rgba(255,255,255,0.7)', anchor: 'middle' }) : ''}
`, { width, height, bg: false });
        });

        // ============== LEAVE ==============
        this.registerTemplate('leave', (p, { width, height }) => {
            return this._wrap(`
${this._gradientBackground('#ed4245', '#992d22')}
${this._defs()}
<rect width="100%" height="100%" fill="url(#bg)"/>
${this._avatarCircle({ url: p.avatarUrl, radius: 80 })}
${this._text({ x: width / 2, y: 340, content: '➖ Départ', size: 28, color: 'rgba(255,255,255,0.7)', anchor: 'middle' })}
${this._text({ x: width / 2, y: 400, content: p.username || 'Un membre', size: 42, color: '#ffffff', anchor: 'middle', weight: 'bold' })}
${p.stayDuration ? this._text({ x: width / 2, y: 450, content: `Membre depuis ${p.stayDuration}`, size: 16, color: 'rgba(255,255,255,0.6)', anchor: 'middle' }) : ''}
`, { width, height, bg: false });
        });

        // ============== LEVEL UP ==============
        this.registerTemplate('level_up', (p, { width, height }) => {
            const title = p.title || '🎉 Niveau supérieur !';
            const level = p.level || 1;
            const progress = p.progressPercent || 0;
            return this._wrap(`
${this._gradientBackground('#fee75c', '#eb459e')}
${this._defs()}
<rect width="100%" height="100%" fill="url(#bg)"/>
${this._avatarCircle({ url: p.avatarUrl, radius: 80 })}
${this._text({ x: width / 2, y: 320, content: title, size: 36, color: '#ffffff', anchor: 'middle', weight: 'bold' })}
${this._text({ x: width / 2, y: 380, content: p.username || 'Utilisateur', size: 28, color: 'rgba(255,255,255,0.9)', anchor: 'middle' })}
${this._text({ x: width / 2, y: 430, content: `Niveau ${level}`, size: 22, color: 'rgba(255,255,255,0.8)', anchor: 'middle' })}
${this._progressBar({ x: width / 2 - 200, y: 460, width: 400, height: 14, percent: progress })}
`, { width, height, bg: false });
        });

        // ============== GIVEAWAY ==============
        this.registerTemplate('giveaway', (p, { width, height }) => {
            return this._wrap(`
${this._gradientBackground('#f2c7ce', '#eb459e')}
${this._defs()}
<rect width="100%" height="100%" fill="url(#bg)"/>
${this._text({ x: width / 2, y: 80, content: '🎉 GIVEAWAY', size: 28, color: 'rgba(255,255,255,0.8)', anchor: 'middle', weight: 'bold' })}
<rect x="40" y="100" width="${width - 80}" height="${height - 140}" rx="20" fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
${this._text({ x: width / 2, y: 180, content: p.prize || 'Lot mystère', size: 40, color: '#ffffff', anchor: 'middle', weight: 'bold' })}
${this._text({ x: width / 2, y: 220, content: `Organisé par ${p.host || 'Staff'}`, size: 18, color: 'rgba(255,255,255,0.7)', anchor: 'middle' })}
${p.winnersCount ? this._text({ x: width / 2, y: 280, content: `🏆 ${p.winnersCount} gagnant(s)`, size: 22, color: '#ffffff', anchor: 'middle' }) : ''}
${p.endsAt ? this._text({ x: width / 2, y: 330, content: `Se termine : ${p.endsAt}`, size: 18, color: 'rgba(255,255,255,0.85)', anchor: 'middle' }) : ''}
${p.description ? this._text({ x: width / 2, y: 380, content: p.description, size: 16, color: 'rgba(255,255,255,0.75)', anchor: 'middle' }) : ''}
${this._text({ x: width / 2, y: height - 30, content: 'Réagis avec 🎉 pour participer', size: 18, color: 'rgba(255,255,255,0.7)', anchor: 'middle' })}
`, { width, height, bg: false });
        });

        // ============== GENERIC ==============
        this.registerTemplate('generic', (p, { width, height }) => {
            return this._wrap(`
${this._gradientBackground(p.color1 || '#5865f2', p.color2 || '#f2c7ce')}
${this._defs()}
<rect width="100%" height="100%" fill="url(#bg)"/>
${p.avatarUrl ? this._avatarCircle({ url: p.avatarUrl, radius: 80 }) : ''}
${this._text({ x: width / 2, y: p.avatarUrl ? 340 : 200, content: p.title || 'Bot', size: 48, color: '#ffffff', anchor: 'middle', weight: 'bold' })}
${p.subtitle ? this._text({ x: width / 2, y: p.avatarUrl ? 400 : 260, content: p.subtitle, size: 22, color: 'rgba(255,255,255,0.85)', anchor: 'middle' }) : ''}
`, { width, height, bg: false });
        });
    }
}

module.exports = { CardRendererService };
