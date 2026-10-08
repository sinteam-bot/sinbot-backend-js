/**
 * src/modules/util_autofeeds/services/providers/animesphere.provider.js
 *
 * Fournisseur pour le planning des sorties d'animes et épisodes (AnimeSphere.io)
 * avec enrichissement multilingue (FR, Anglais, Romaji) et distinction 1er épisode/film vs récurrent.
 */

const { BaseFeedProvider } = require('./base.provider.js');

class AnimeSphereFeedProvider extends BaseFeedProvider {
    constructor() {
        super({
            name: 'animesphere',
            label: 'AnimeSphere (Planning Anime & Épisodes)',
            icon: '🌸',
            description: 'Planning des sorties d\'animes et épisodes en simulcast (Crunchyroll, ADN, Netflix).'
        });

        // Cache mémoire des métadonnées AniList par ID pour éviter les requêtes répétitives
        this._aniListCache = new Map();
    }

    resolveUrl(input = '') {
        const trimmed = (input || '').trim();
        if (!trimmed || trimmed.toLowerCase() === 'animesphere' || trimmed.toLowerCase() === 'anime') {
            return 'https://animesphere.io/planning';
        }
        return trimmed;
    }

    /**
     * Résout les références de déshydratation dans le tableau __NUXT_DATA__.
     */
    _resolveNuxtRef(val, arr, depth = 0) {
        if (depth > 6 || val === null || val === undefined) return val;
        if (typeof val === 'number' && val >= 0 && val < arr.length && arr[val] !== undefined) {
            return this._resolveNuxtRef(arr[val], arr, depth + 1);
        }
        if (Array.isArray(val)) {
            // Si c'est un wrapper Reactive/ShallowReactive de Nuxt, prendre l'élément suivant
            if (val[0] === 'Reactive' || val[0] === 'ShallowReactive') {
                return this._resolveNuxtRef(val[1], arr, depth + 1);
            }
            return val.map(x => this._resolveNuxtRef(x, arr, depth + 1));
        }
        if (typeof val === 'object') {
            const res = {};
            for (const [k, v] of Object.entries(val)) {
                res[k] = this._resolveNuxtRef(v, arr, depth + 1);
            }
            return res;
        }
        return val;
    }

    /**
     * Interroge l'API publique AniList GraphQL pour récupérer les titres en Romaji et Anglais.
     */
    async _fetchAniListTitles(anilistId) {
        if (!anilistId || typeof anilistId !== 'number') return null;
        if (this._aniListCache.has(anilistId)) {
            return this._aniListCache.get(anilistId);
        }

        const query = `
            query ($id: Int) {
                Media (id: $id, type: ANIME) {
                    title {
                        romaji
                        english
                        native
                    }
                    genres
                }
            }
        `;

        try {
            const res = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'ChienneBot/3.0' },
                body: JSON.stringify({ query, variables: { id: anilistId } }),
                signal: AbortSignal.timeout(4000)
            });

            if (!res.ok) return null;
            const data = await res.json();
            const titles = data?.data?.Media?.title || null;
            if (titles) {
                this._aniListCache.set(anilistId, titles);
            }
            return titles;
        } catch {
            return null;
        }
    }

    async fetchItems(feed) {
        const targetUrl = this.resolveUrl(feed.feedUrl);

        const res = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml'
            },
            signal: AbortSignal.timeout(8000)
        });

        if (!res.ok) {
            throw new Error(`AnimeSphere a répondu avec le statut HTTP ${res.status}`);
        }

        const html = await res.text();
        const nuxtMatch = html.match(/<script type="application\/json"[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!nuxtMatch) {
            throw new Error('Données AnimeSphere (__NUXT_DATA__) introuvables sur la page.');
        }

        let arr;
        try {
            arr = JSON.parse(nuxtMatch[1]);
        } catch (e) {
            throw new Error(`Échec de parsing des données AnimeSphere: ${e.message}`);
        }

        // Trouver les objets animes dans le catalogue
        const rawAnimes = arr.filter(x => x && typeof x === 'object' && x.anilistId !== undefined && x.title !== undefined);
        const items = [];

        for (const raw of rawAnimes.slice(0, 30)) {
            const anime = this._resolveNuxtRef(raw, arr);
            if (!anime || !anime.title) continue;

            const titleFr = String(anime.title || '').trim();
            const anilistId = typeof anime.anilistId === 'number' ? anime.anilistId : null;
            const aniTitles = anilistId ? await this._fetchAniListTitles(anilistId) : null;

            const titleRomaji = aniTitles?.romaji || titleFr;
            const titleEn = aniTitles?.english || titleFr;
            const titleJp = aniTitles?.native || null;

            const format = String(anime.format || 'TV').toUpperCase();
            const isMovie = format.includes('MOVIE') || format.includes('FILM');
            
            // Si format film OU si c'est la date de démarrage (dateStart correspond au lancement)
            const isFirstEpisodeOrMovie = isMovie || Boolean(anime.isFirstEpisode) || (anime.episodeNumber === 1);

            const platforms = Array.isArray(anime.platforms) ? anime.platforms.filter(Boolean) : [];
            const genres = Array.isArray(anime.genres) ? anime.genres.filter(Boolean) : [];
            const description = this.cleanHtml(anime.description || '');

            const dateStart = anime.dateStart || anime.dateAiring || new Date().toISOString().slice(0, 10);
            const publishedAt = dateStart ? new Date(dateStart).getTime() : Date.now();

            const platformUrl = anime.urlAnimePlatform || `https://animesphere.io/anime/${anime.slug || ''}`;
            const platformsLabel = platforms.length > 0 ? platforms.join(', ') : 'Simulcast';

            // Titre d'affichage
            let displayTitle = '';
            if (isMovie) {
                displayTitle = `🎬 [Film] ${titleFr}`;
            } else if (isFirstEpisodeOrMovie) {
                displayTitle = `🌸 [Nouveau] ${titleFr} (Épisode 1)`;
            } else {
                const epLabel = anime.episodeNumber ? `Épisode ${anime.episodeNumber}` : 'Nouvel épisode';
                displayTitle = `📺 ${titleFr} - ${epLabel}`;
            }

            const tags = ['#anime'];
            if (platforms.some(p => p.toLowerCase().includes('crunchyroll'))) tags.push('#crunchyroll');
            if (platforms.some(p => p.toLowerCase().includes('netflix'))) tags.push('#netflix');
            if (platforms.some(p => p.toLowerCase().includes('adn') || p.toLowerCase().includes('anime digital network'))) tags.push('#adn');
            if (isMovie) tags.push('#film', '#movie');
            genres.slice(0, 3).forEach(g => tags.push(`#${g.toLowerCase().replace(/[^a-z0-9]/g, '')}`));

            items.push({
                id: `animesphere:${anime.slug || anilistId || titleFr}:${dateStart}`,
                guid: `animesphere:${anime.slug || anilistId || titleFr}:${dateStart}`,
                title: displayTitle,
                link: platformUrl,
                url: platformUrl,
                author: platformsLabel,
                content: description || `Sortie sur ${platformsLabel}.`,
                contentSnippet: description ? description.slice(0, 280) : `Sortie sur ${platformsLabel}.`,
                imageUrl: anime.imageUrl || null,
                publishedAt,
                tags,
                source: 'animesphere',
                extra: {
                    mediaType: 'anime',
                    isFirstEpisodeOrMovie,
                    titleFr,
                    titleEn,
                    titleRomaji,
                    titleJp,
                    platforms,
                    streamingUrl: platformUrl,
                    season: anime.season || null,
                    seasonYear: anime.seasonYear || null,
                    episodeCount: anime.episodeCount || null,
                    episodeNumber: anime.episodeNumber || (isFirstEpisodeOrMovie ? 1 : null),
                    format: anime.format || 'TV',
                    studios: Array.isArray(anime.studios) ? anime.studios.join(', ') : null
                }
            });
        }

        return items;
    }
}

module.exports = { AnimeSphereFeedProvider };
