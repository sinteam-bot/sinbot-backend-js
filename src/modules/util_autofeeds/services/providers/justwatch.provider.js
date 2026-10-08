/**
 * src/modules/util_autofeeds/services/providers/justwatch.provider.js
 *
 * Fournisseur JustWatch France pour le suivi des nouveaux films et séries
 * sur les plateformes de streaming (Netflix, Disney+, Prime Video, Canal+, etc.).
 */

const { BaseFeedProvider } = require('./base.provider.js');

class JustWatchFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'justwatch',
            label: 'JustWatch (Nouveautés Séries & Films FR)',
            icon: '🍿',
            description: 'Suivi officiel des nouvelles sorties films et séries sur Netflix, Prime, Disney+, Canal+.'
        });
    }

    resolveUrl(input = '') {
        const trimmed = (input || '').trim();
        if (!trimmed || trimmed.toLowerCase() === 'justwatch' || trimmed.toLowerCase() === 'justwatch:fr') {
            return 'https://www.justwatch.com/fr/nouveau';
        }
        return trimmed;
    }

    /**
     * Convertit un template de poster JustWatch en URL d'image exploitable.
     * Exemple: "/poster/345990721/{profile}/saison-1.{format}" -> "https://images.justwatch.com/poster/345990721/s592/saison-1.webp"
     */
    _formatPosterUrl(posterTemplate) {
        if (!posterTemplate || typeof posterTemplate !== 'string') return null;
        if (posterTemplate.startsWith('http://') || posterTemplate.startsWith('https://')) return posterTemplate;

        const path = posterTemplate
            .replace('{profile}', 's592')
            .replace('{format}', 'webp')
            .replace(/^\//, '');

        return `https://images.justwatch.com/${path}`;
    }

    async fetchItems(feed) {
        const query = `
            query GetNewReleases {
                newTitles(country: "FR", first: 25) {
                    edges {
                        node {
                            id
                            objectType
                            content(country: "FR", language: "fr") {
                                title
                                shortDescription
                                originalReleaseYear
                                posterUrl
                            }
                            ... on Season {
                                totalEpisodeCount
                                show {
                                    id
                                    content(country: "FR", language: "fr") {
                                        title
                                        originalReleaseYear
                                        shortDescription
                                        posterUrl
                                    }
                                }
                            }
                            offers(country: "FR", platform: WEB) {
                                package {
                                    clearName
                                    technicalName
                                }
                                standardWebURL
                                monetizationType
                            }
                        }
                    }
                }
            }
        `;

        const res = await fetch('https://apis.justwatch.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(8000)
        });

        if (!res.ok) {
            throw new Error(`L'API GraphQL JustWatch a répondu avec le code HTTP ${res.status}`);
        }

        const json = await res.json();
        const edges = json?.data?.newTitles?.edges || [];
        const items = [];

        for (const edge of edges) {
            const node = edge?.node;
            if (!node) continue;

            const objectType = node.objectType || 'MOVIE';
            const isMovie = objectType === 'MOVIE';

            const rawContent = node.content || {};
            const showContent = node.show?.content || {};

            const mainTitle = isMovie 
                ? (rawContent.title || 'Film sans titre')
                : (showContent.title || rawContent.title || 'Série sans titre');

            const subTitle = isMovie ? '' : (rawContent.title || '');
            const description = this.cleanHtml(rawContent.shortDescription || showContent.shortDescription || '');
            const year = rawContent.originalReleaseYear || showContent.originalReleaseYear || new Date().getFullYear();

            // Image de poster
            const rawPoster = isMovie ? rawContent.posterUrl : (rawContent.posterUrl || showContent.posterUrl);
            const posterUrl = this._formatPosterUrl(rawPoster);

            // Plateformes d'offres (dédupliquées)
            const rawOffers = Array.isArray(node.offers) ? node.offers : [];
            const platformMap = new Map();
            for (const offer of rawOffers) {
                const pkgName = offer.package?.clearName;
                if (pkgName && !platformMap.has(pkgName)) {
                    platformMap.set(pkgName, offer.standardWebURL);
                }
            }

            const platforms = Array.from(platformMap.keys());
            const primaryWatchUrl = rawOffers.find(o => o.standardWebURL)?.standardWebURL 
                || `https://www.justwatch.com/fr/recherche?q=${encodeURIComponent(mainTitle)}`;

            const isFirstSeason = !isMovie && (subTitle.toLowerCase().includes('saison 1') || subTitle.toLowerCase().includes('mini-série'));
            const isFirstEpisodeOrMovie = isMovie || isFirstSeason;

            let displayTitle = '';
            if (isMovie) {
                displayTitle = `🎬 [Film] ${mainTitle} (${year})`;
            } else if (isFirstSeason) {
                displayTitle = `🍿 [Nouvelle Série] ${mainTitle} - ${subTitle}`;
            } else {
                displayTitle = `📺 ${mainTitle} - ${subTitle || 'Nouvel épisode'} disponible !`;
            }

            const tags = ['#streaming', isMovie ? '#film' : '#serie'];
            platforms.forEach(p => tags.push(`#${p.toLowerCase().replace(/[^a-z0-9]/g, '')}`));

            items.push({
                id: `justwatch:${node.id}`,
                guid: `justwatch:${node.id}`,
                title: displayTitle,
                link: primaryWatchUrl,
                url: primaryWatchUrl,
                author: platforms.join(', ') || 'Streaming FR',
                content: description || `Disponible dès maintenant sur ${platforms.join(', ') || 'les plateformes de streaming'}.`,
                contentSnippet: description ? description.slice(0, 280) : `Disponible sur ${platforms.join(', ')}.`,
                imageUrl: posterUrl,
                publishedAt: Date.now(),
                tags,
                source: 'justwatch',
                extra: {
                    mediaType: isMovie ? 'movie' : 'series',
                    isFirstEpisodeOrMovie,
                    titleFr: mainTitle,
                    titleEn: null,
                    titleRomaji: null,
                    subtitle: subTitle,
                    platforms,
                    streamingUrl: primaryWatchUrl,
                    releaseYear: year,
                    totalEpisodeCount: node.totalEpisodeCount || null
                }
            });
        }

        return items;
    }
}

module.exports = { JustWatchFeedProvider };
