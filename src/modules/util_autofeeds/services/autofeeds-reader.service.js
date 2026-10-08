/**
 * autofeeds-reader.service.js
 * 
 * Mode Lecture Épuré (Instant Reader View).
 * Extrait le contenu éditorial épuré d'une page Web (titre, image principale,
 * paragraphes de texte, auteur, estimation du temps de lecture) en éliminant
 * les bannières publicitaires, menus, scripts et cookies.
 */

const logger = require('../../../utils/logger');

class AutofeedsReaderService {
    /**
     * Extrait une vue lecture propre depuis une URL ou un contenu HTML.
     * @param {string} url 
     * @param {string} [providedHtml]
     * @returns {Promise<Object>}
     */
    async extractCleanArticle(url, providedHtml = null) {
        let html = providedHtml;

        if (!html && url) {
            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    signal: AbortSignal.timeout(6000)
                });
                html = await response.text();
            } catch (err) {
                logger.warn(`[AutofeedsReader] Erreur récupération page ${url}: ${err.message}`, 'AUTOFEEDS');
                throw new Error(`Impossible de récupérer l'article: ${err.message}`);
            }
        }

        if (!html) {
            throw new Error('Contenu HTML vide ou inaccessible');
        }

        return this.parseArticleHtml(html, url);
    }

    /**
     * Analyse et nettoie le HTML brut pour extraire les métadonnées et le texte utile.
     * @param {string} html 
     * @param {string} [url] 
     * @returns {Object}
     */
    parseHtmlArticle(html, url = '') {
        return this.parseArticleHtml(html, url);
    }

    parseArticleHtml(html, url = '') {
        let title = '';
        let leadImage = null;
        let author = null;
        let siteName = null;

        if (url) {
            try {
                siteName = new URL(url).hostname.replace(/^www\./, '');
            } catch {}
        }

        // 1. Extraction titre
        const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

        if (ogTitleMatch) title = this._cleanText(ogTitleMatch[1]);
        else if (h1Match) title = this._cleanText(h1Match[1]);
        else if (titleTagMatch) title = this._cleanText(titleTagMatch[1]);

        // 2. Extraction image principale
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (ogImageMatch) {
            leadImage = ogImageMatch[1];
        }

        // 3. Extraction auteur
        const authorMatch = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i);
        if (authorMatch) {
            author = this._cleanText(authorMatch[1]);
        }

        // 4. Extraction site name
        const siteNameMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
        if (siteNameMatch) {
            siteName = this._cleanText(siteNameMatch[1]);
        }

        // 5. Nettoyage du corps HTML (suppression des scripts, styles, nav, footer, header, iframes)
        let cleanedHtml = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
            .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
            .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
            .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

        // 6. Extraction des paragraphes <p>
        const paragraphMatches = cleanedHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
        const paragraphs = [];

        for (const m of paragraphMatches) {
            const text = this._cleanText(m[1]);
            // Filtrer les paragraphes trop courts ou bannières de cookies
            if (text.length > 30 && !/(cookie|rgpd|newsletter|droits réservés|copyright)/i.test(text)) {
                paragraphs.push(text);
            }
        }

        const fullText = paragraphs.join('\n\n');
        const words = fullText.split(/\s+/).filter(Boolean);
        const wordCount = words.length;
        const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

        return {
            url,
            title: title || 'Article sans titre',
            author,
            siteName,
            leadImage,
            leadImageUrl: leadImage,
            paragraphs,
            text: fullText,
            textContent: fullText,
            wordCount,
            readingTimeMinutes
        };
    }

    _cleanText(str) {
        if (!str) return '';
        return str
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

const autofeedsReaderService = new AutofeedsReaderService();

module.exports = {
    AutofeedsReaderService,
    autofeedsReaderService
};
