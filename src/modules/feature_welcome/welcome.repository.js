/**
 * welcome.repository.js — Repository du module feature_welcome.
 *
 * Étape 2 (strangler-fig) : réexporte les fonctions du bridge de
 * compatibilité `db/legacy-bridge.js`. Aucune logique n'est dupliquée.
 * Étape 4 : les fonctions seront portées nativement en Drizzle ici.
 *
 * Utilisation dans un service du module :
 *   const { welcome } = require('./welcome.repository.js');
 *   await welcome.someMethod(...);
 */

const { Repository } = require('../../core/index.js');
const bridge = require('../../db/legacy-bridge.js');

class Welcome.repositoryRepository {
    constructor() {
        this.bridge = bridge.welcome;
    }

    /**
     * Indique que ce repository est un wrapper legacy.
     * Sera supprimé en étape 4 une fois la migration Drizzle terminée.
     */
    isLegacyBridge() {
        return true;
    }
}

Repository()(this.Welcome.repositoryRepository = Welcome.repositoryRepository);

module.exports = { Welcome.repositoryRepository };
