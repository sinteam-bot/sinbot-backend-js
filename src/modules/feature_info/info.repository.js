/**
 * info.repository.js — Repository du module feature_info.
 *
 * Étape 2 (strangler-fig) : réexporte les fonctions du bridge de
 * compatibilité `db/legacy-bridge.js`. Aucune logique n'est dupliquée.
 * Étape 4 : les fonctions seront portées nativement en Drizzle ici.
 *
 * Utilisation dans un service du module :
 *   const { botState } = require('./info.repository.js');
 *   await botState.someMethod(...);
 */

const { Repository } = require('../../core/index.js');
const bridge = require('../../db/legacy-bridge.js');

class Info.repositoryRepository {
    constructor() {
        this.bridge = /* TODO: bridge à identifier en étape 4 */;
    }

    /**
     * Indique que ce repository est un wrapper legacy.
     * Sera supprimé en étape 4 une fois la migration Drizzle terminée.
     */
    isLegacyBridge() {
        return true;
    }
}

Repository()(this.Info.repositoryRepository = Info.repositoryRepository);

module.exports = { Info.repositoryRepository };
