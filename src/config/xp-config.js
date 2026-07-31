// Configuration du système XP
module.exports = {
    // XP par message
    MESSAGE_XP: {
        MIN: 15,              // XP minimum par message
        MAX: 25,              // XP maximum par message
        COOLDOWN: 10          // Cooldown en secondes entre deux gains d'XP
    },
    
    // XP vocal
    VOICE_XP: {
        PER_MINUTE: 2,        // XP par minute en vocal
        CHECK_INTERVAL: 5,    // Vérifier toutes les X minutes
        MIN_DURATION: 1       // Minimum de minutes pour gagner de l'XP
    },
    
    // Formule de calcul de niveau
    LEVEL: {
        BASE_XP: 100,         // XP requis pour le niveau 1
        MULTIPLIER: 1.5,      // Multiplicateur par niveau
        // Formule : BASE_XP * (niveau ^ MULTIPLIER)
        // Niveau 1: 100 XP
        // Niveau 2: 225 XP
        // Niveau 3: 520 XP
        // Niveau 10: ~3162 XP
        // Niveau 20: ~17889 XP
    },
    
    // Bonus
    BONUS: {
        DAILY_FIRST_MESSAGE: 50,   // Bonus pour le premier message du jour
        STREAK_MULTIPLIER: 1.1,    // +10% XP par jour consécutif (max 7 jours)
        EVENT_MULTIPLIER: 2        // Double XP pendant les événements
    },
    
    // Limites anti-spam
    LIMITS: {
        MAX_XP_PER_DAY: 5000,      // Maximum d'XP par jour
        MAX_MESSAGES_PER_MINUTE: 5  // Ignorer après X messages par minute
    },
    
    // Récompenses de niveau (à personnaliser selon vos rôles)
    LEVEL_ROLES: {
        5: 'Membre Actif',
        10: 'Membre Dévoué',
        20: 'Vétéran',
        30: 'Légende',
        50: 'Dieu du serveur'
    }
};