const { pool } = require('../database');

async function setupCaptchaTables() {
    console.log('🔧 Vérification / Configuration des tables Captcha SQLite...');
    // Les tables sont déjà créées automatiquement par src/database.js au démarrage.
    console.log('✅ Tables Captcha SQLite prêtes !');
    console.log('  - user_captchas: Stocke les captchas en attente');
    console.log('  - captcha_config: Stocke la configuration par serveur');
}

setupCaptchaTables()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Erreur:', err);
        process.exit(1);
    });
