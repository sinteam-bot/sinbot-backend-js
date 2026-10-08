/**
 * src/modules/util_autofeeds/services/autofeeds-opml.service.js
 *
 * Service d'import et export OPML (Outline Processor Markup Language) standard
 * pour sauvegarder ou migrer des listes de flux RSS.
 */

const { parseStringPromise } = require('xml2js');
const { Injectable } = require('../../../core/index.js');
const { logger } = require('../../../utils/logger.js');

class AutofeedsOpmlService {
    /**
     * Parse un contenu XML OPML et extrait les flux trouvés.
     * @param {string} xmlContent
     * @returns {Promise<Array<{ feedUrl: string, name: string, category: string, tags: string[] }>>}
     */
    async parseOpml(xmlContent) {
        if (!xmlContent || typeof xmlContent !== 'string') return [];

        const result = await parseStringPromise(xmlContent, { explicitArray: false, mergeAttrs: true });
        const outlines = [];

        function traverse(node, currentCategory = 'general') {
            if (!node) return;

            const category = node.category || node.text || node.title || currentCategory;

            if (node.xmlUrl || node.url) {
                const feedUrl = node.xmlUrl || node.url;
                const name = node.title || node.text || 'Flux OPML';
                const tagsRaw = node.tags || '';
                const tags = typeof tagsRaw === 'string'
                    ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
                    : [];

                outlines.push({
                    feedUrl,
                    xmlUrl: feedUrl,
                    name,
                    title: name,
                    category: (currentCategory || 'general').toLowerCase(),
                    tags
                });
            }

            if (node.outline) {
                const children = Array.isArray(node.outline) ? node.outline : [node.outline];
                for (const child of children) {
                    traverse(child, category);
                }
            }
        }

        const body = result?.opml?.body;
        if (body?.outline) {
            const rootOutlines = Array.isArray(body.outline) ? body.outline : [body.outline];
            for (const root of rootOutlines) {
                traverse(root, root.text || root.title || 'general');
            }
        }

        return outlines;
    }

    /**
     * Génère un document XML OPML à partir d'une liste de flux.
     * @param {Array} feeds - Liste des flux
     * @param {string} guildName - Nom du serveur Discord
     * @returns {string} XML OPML
     */
    generateOpml(feeds = [], guildName = 'Serveur Discord') {
        const categories = {};

        for (const feed of feeds) {
            const cat = feed.category || 'general';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(feed);
        }

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<opml version="2.0">\n';
        xml += '  <head>\n';
        xml += `    <title>Chienne-bot Feeds - ${this._escapeXml(guildName)}</title>\n`;
        xml += `    <dateCreated>${new Date().toUTCString()}</dateCreated>\n`;
        xml += '  </head>\n';
        xml += '  <body>\n';

        for (const [category, catFeeds] of Object.entries(categories)) {
            xml += `    <outline text="${this._escapeXml(category)}" title="${this._escapeXml(category)}">\n`;
            for (const f of catFeeds) {
                const tagsStr = (f.tags || []).join(',');
                xml += `      <outline type="rss" text="${this._escapeXml(f.name || f.feedUrl)}" title="${this._escapeXml(f.name || f.feedUrl)}" xmlUrl="${this._escapeXml(f.feedUrl)}" category="${this._escapeXml(category)}" tags="${this._escapeXml(tagsStr)}" />\n`;
            }
            xml += '    </outline>\n';
        }

        xml += '  </body>\n';
        xml += '</opml>\n';

        return xml;
    }

    _escapeXml(str = '') {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

Injectable()(AutofeedsOpmlService);

module.exports = { AutofeedsOpmlService };
