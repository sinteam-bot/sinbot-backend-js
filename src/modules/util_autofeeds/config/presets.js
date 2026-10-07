/**
 * src/modules/util_autofeeds/config/presets.js
 *
 * Catalogue de flux prédéfinis prêts à l'emploi (LootScraper, Gaming, News, etc.).
 */

const PRESETS = [
    // --- 🎮 LOOTSCRAPER (Jeux gratuits & Bons plans) ---
    {
        id: 'lootscraper-all',
        name: 'LootScraper - Tous les jeux gratuits & butins',
        description: 'Agrégateur complet de tous les jeux gratuits PC, consoles et butins (Epic, Steam, GOG, Prime).',
        feedUrl: 'https://eikowagenknecht.com/lootscraper/all.xml',
        provider: 'rss',
        category: 'gaming',
        tags: ['loot', 'free', 'giveaway', 'gaming', 'pc'],
        color: '#FEE75C',
        icon: '🎁',
        sourceName: 'LootScraper'
    },
    {
        id: 'lootscraper-epic',
        name: 'LootScraper - Epic Games Store Gratuits',
        description: 'Jeux gratuits hebdomadaires offerts sur l\'Epic Games Store.',
        feedUrl: 'https://eikowagenknecht.com/lootscraper/epic-games.xml',
        provider: 'rss',
        category: 'gaming',
        tags: ['epic', 'free', 'pc', 'giveaway', 'gaming'],
        color: '#313131',
        icon: '🖤',
        sourceName: 'LootScraper'
    },
    {
        id: 'lootscraper-steam',
        name: 'LootScraper - Steam Jeux Gratuits',
        description: 'Offres temporaires à 100% de réduction et promotions gratuites sur Steam.',
        feedUrl: 'https://eikowagenknecht.com/lootscraper/steam.xml',
        provider: 'rss',
        category: 'gaming',
        tags: ['steam', 'free', 'pc', 'valve', 'deals'],
        color: '#1B2838',
        icon: '🎮',
        sourceName: 'LootScraper'
    },
    {
        id: 'lootscraper-gog',
        name: 'LootScraper - GOG (Good Old Games)',
        description: 'Jeux sans DRM offerts et giveaways sur la plateforme GOG.',
        feedUrl: 'https://eikowagenknecht.com/lootscraper/gog.xml',
        provider: 'rss',
        category: 'gaming',
        tags: ['gog', 'free', 'drm-free', 'pc', 'giveaway'],
        color: '#8A2BE2',
        icon: '👾',
        sourceName: 'LootScraper'
    },
    {
        id: 'lootscraper-prime',
        name: 'LootScraper - Prime Gaming & Amazon',
        description: 'Jeux complets et drops de butins en jeu inclus dans l\'abonnement Prime.',
        feedUrl: 'https://eikowagenknecht.com/lootscraper/prime-gaming.xml',
        provider: 'rss',
        category: 'gaming',
        tags: ['prime', 'amazon', 'free', 'loot', 'twitch'],
        color: '#00A8E1',
        icon: '📦',
        sourceName: 'LootScraper'
    },
    {
        id: 'lootscraper-itch',
        name: 'LootScraper - Itch.io Indés Gratuits',
        description: 'Promotions à 100% et créations indépendantes offertes sur Itch.io.',
        feedUrl: 'https://eikowagenknecht.com/lootscraper/itch-io.xml',
        provider: 'rss',
        category: 'gaming',
        tags: ['itch', 'indie', 'free', 'pc'],
        color: '#FA5C5C',
        icon: '🕹️',
        sourceName: 'LootScraper'
    },

    // --- 🤖 REDDIT ---
    {
        id: 'reddit-freegamefindings',
        name: 'Reddit - r/FreeGameFindings',
        description: 'Communauté Reddit dédiée aux signalements de jeux gratuits multi-plateformes.',
        feedUrl: 'https://www.reddit.com/r/FreeGameFindings/new.rss',
        provider: 'reddit',
        category: 'gaming',
        tags: ['reddit', 'free', 'giveaway', 'gaming'],
        color: '#FF4500',
        icon: '🤖',
        sourceName: 'Reddit'
    },
    {
        id: 'reddit-gamedeals',
        name: 'Reddit - r/GameDeals',
        description: 'Les meilleurs rabais et bons plans jeux vidéo du web dénichés par la communauté.',
        feedUrl: 'https://www.reddit.com/r/GameDeals/new.rss',
        provider: 'reddit',
        category: 'gaming',
        tags: ['reddit', 'deals', 'discounts', 'gaming'],
        color: '#FF4500',
        icon: '💰',
        sourceName: 'Reddit'
    },

    // --- 📰 ACTUALITÉS & TECH ---
    {
        id: 'google-news-tech',
        name: 'Google News - Actualités Technologie',
        description: 'Dernières actualités de l\'informatique, IA et nouvelles technologies.',
        feedUrl: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=fr&gl=FR&ceid=FR:fr',
        provider: 'google_news',
        category: 'tech',
        tags: ['tech', 'news', 'google_news', 'innovation'],
        color: '#4285F4',
        icon: '⚡',
        sourceName: 'Google News'
    },
    {
        id: 'google-news-jeux-video',
        name: 'Google News - Jeux Vidéo',
        description: 'Actualités presse gaming en français (sorties, annonces, studios).',
        feedUrl: 'https://news.google.com/rss/search?q=jeux+video&hl=fr&gl=FR&ceid=FR:fr',
        provider: 'google_news',
        category: 'gaming',
        tags: ['gaming', 'news', 'jeuxvideo'],
        color: '#EA4335',
        icon: '📰',
        sourceName: 'Google News'
    }
];

module.exports = { PRESETS };
