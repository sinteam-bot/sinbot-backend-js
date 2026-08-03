// ============================================
// CONFIGURATION DU SYSTÈME DE CAPTCHA
// ============================================

module.exports = {
    // Activer ou désactiver le système de captcha
    ENABLED: true,

    CAPTCHA_LOG_CHANNEL: '1338142545313796107',

    // ID du canal où les captchas seront envoyés
    // Si non défini, un canal sera créé automatiquement
    CAPTCHA_CHANNEL_ID: null,

    // Nom du canal captcha à créer (si CAPTCHA_CHANNEL_ID est null)
    CAPTCHA_CHANNEL_NAME: '✅-verification-captcha',

    // ID du rôle à donner après validation du captcha
    // Remplacez par l'ID réel de votre rôle "✅ Vérifié" (obtenu via mode développeur Discord)
    VERIFIED_ROLE_ID: '1337917252732850206',

    // Nom du rôle à créer si VERIFIED_ROLE_ID est null
    //VERIFIED_ROLE_NAME: '✅ Vérifié',

    // Couleur du rôle vérifié
    //VERIFIED_ROLE_COLOR: '#2ecc71',

    // Temps avant expiration du captcha (en minutes)
    CAPTCHA_TIMEOUT: 10,

    // Nombre de tentatives autorisées
    MAX_ATTEMPTS: 3,

    // Configuration des questions mathématiques
    MATH_QUESTIONS: {
        MIN_NUMBER: 1,
        MAX_NUMBER: 20,
        // Types d'opérations possibles
        OPERATIONS: ['+', '-', '*'],
        // Poids de chaque opération (pour la sélection aléatoire)
        OPERATION_WEIGHTS: {
            '+': 0.6,
            '-': 0.3,
            '*': 0.1
        }
    },

    // Messages
    MESSAGES: {
        WELCOME_MESSAGE: 'Bienvenue sur le serveur ! Pour accéder au reste du serveur, tu dois résoudre ce captcha :',
        CAPTCHA_QUESTION: 'Combien font {num1} {operator} {num2} ?',
        INSTRUCTIONS: 'Réponds avec le résultat **en chiffres** (exemple: 18) dans ce canal.',
        SUCCESS_MESSAGE: '✅ Bravo ! Ta réponse est correcte. Tu as maintenant accès au serveur !',
        FAIL_MESSAGE: 'Mauvaise réponse, tu n\'as plus que {attempts} tentative(s) <:Obsydemoncouverture:1488145689916473544>. ',
        TIMEOUT_MESSAGE: '⏰ Temps écoulé ! Le captcha a expiré. Veuillez réessayer en rejoignant à nouveau le serveur.',
        MAX_ATTEMPTS_MESSAGE: '❌ Trop de tentatives incorrectes. Veuillez quitter et rejoindre le serveur pour réessayer.',
        ALREADY_VERIFIED: '✅ Tu as déjà été vérifié !'
    },

    // Messages pour les logs
    LOG_MESSAGES: {
        CAPTCHA_CREATED: '🔒 Captcha créé pour {username} ({userId})',
        CAPTCHA_SUCCESS: '✅ Captcha validé pour {username} ({userId})',
        CAPTCHA_FAILED: '❌ Captcha échoué pour {username} ({userId}) - Tentative {attempt}/{max}',
        CAPTCHA_TIMEOUT: '⏰ Captcha expiré pour {username} ({userId})'
    }
};
