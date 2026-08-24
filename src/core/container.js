/**
 * Conteneur d'injection de dépendances (IoC / Dependency Injection)
 * Permet l'instanciation singleton et l'injection automatique des services, repositories et contrôleurs.
 */
class Container {
    constructor() {
        this.services = new Map();
        this.factories = new Map();
    }

    /**
     * Enregistre une classe ou instance dans le conteneur
     * @param {Function|string} token - Classe ou identifiant
     * @param {Object} [instance] - Instance existante optionnelle
     */
    register(token, instance = null) {
        const key = typeof token === 'string' ? token : token.name;
        if (instance) {
            this.services.set(key, instance);
        } else if (typeof token === 'function') {
            this.factories.set(key, token);
        }
    }

    /**
     * Résout ou instancie une dépendance
     * @param {Function|string} token - Classe ou identifiant
     * @returns {Object}
     */
    resolve(token) {
        const key = typeof token === 'string' ? token : token.name;

        // 1. Déjà instancié (Singleton)
        if (this.services.has(key)) {
            return this.services.get(key);
        }

        // 2. Usine de création
        if (this.factories.has(key)) {
            const TargetClass = this.factories.get(key);
            
            // Résolution automatique des dépendances déclarées dans constructor dependencies si spécifié
            const paramTypes = TargetClass.inject || TargetClass.dependencies || [];
            const dependencies = paramTypes.map(dep => this.resolve(dep));

            const instance = new TargetClass(...dependencies);
            this.services.set(key, instance);
            return instance;
        }

        // 3. Si c'est une fonction constructeur non encore enregistrée
        if (typeof token === 'function') {
            this.factories.set(key, token);
            return this.resolve(token);
        }

        throw new Error(`[Container] Impossible de résoudre la dépendance : "${key}"`);
    }

    /**
     * Vérifie si un service est enregistré
     * @param {Function|string} token
     * @returns {boolean}
     */
    has(token) {
        const key = typeof token === 'string' ? token : token.name;
        return this.services.has(key) || this.factories.has(key);
    }

    /**
     * Réinitialise le conteneur
     */
    clear() {
        this.services.clear();
        this.factories.clear();
    }
}

const defaultContainer = new Container();

module.exports = {
    Container,
    container: defaultContainer
};
