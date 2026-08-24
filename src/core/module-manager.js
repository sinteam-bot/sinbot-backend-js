const express = require('express');
const cron = require('node-cron');
const { container } = require('./container.js');
const { eventBus } = require('./event-bus.js');
const { config, getConfig } = require('../config/index.js');

/**
 * Gestionnaire et chargeur de modules modulaire (style NestJS / Angular)
 */
class ModuleManager {
    constructor(customContainer = container, customEventBus = eventBus) {
        this.container = customContainer;
        this.eventBus = customEventBus;
        this.modules = [];
        this.apiRouter = express.Router();
        this.discordClient = null;
        this.cronJobs = [];
    }

    /**
     * Initialise le gestionnaire avec le client Discord et l'application Express
     * @param {import('discord.js').Client} client
     * @param {import('express').Express} [app]
     */
    init(client, app = null) {
        this.discordClient = client;
        this.eventBus.init(client);

        if (app) {
            app.use(this.apiRouter);
        }

        console.log('🏗️ [ModuleManager] Gestionnaire de modules initialisé.');
    }

    /**
     * Enregistre un module unique
     * @param {Function} ModuleClass
     */
    registerModule(ModuleClass) {
        this._loadModule(ModuleClass);
    }

    /**
     * Enregistre et initialise un ou plusieurs modules
     * @param {Array<Function>|Function} moduleClasses
     */
    registerModules(moduleClasses) {
        const list = Array.isArray(moduleClasses) ? moduleClasses : [moduleClasses];

        for (const ModuleClass of list) {
            this._loadModule(ModuleClass);
        }
    }

    /**
     * Charge un module et ses composants (providers, controllers, events, commands)
     * @private
     */
    _loadModule(ModuleClass) {
        const metadata = ModuleClass.__moduleMetadata || {};
        const moduleName = ModuleClass.name || 'AnonymousModule';

        console.log(`📦 [ModuleManager] Chargement du module: ${moduleName}`);

        // 1. Charger les sous-modules importés
        if (metadata.imports && metadata.imports.length > 0) {
            this.registerModules(metadata.imports);
        }

        // 2. Enregistrer et instancier les Providers & Repositories
        if (metadata.providers) {
            for (const ProviderClass of metadata.providers) {
                this.container.register(ProviderClass);
                const providerInstance = this.container.resolve(ProviderClass);
                this._bindCronTasks(ProviderClass, providerInstance);
            }
        }

        // 3. Enregistrer et monter les Contrôleurs Express
        if (metadata.controllers) {
            for (const ControllerClass of metadata.controllers) {
                this.container.register(ControllerClass);
                const controllerInstance = this.container.resolve(ControllerClass);
                this._mountController(ControllerClass, controllerInstance);
            }
        }

        // 4. Enregistrer et brancher les Événements Discord
        if (metadata.events) {
            for (const EventClass of metadata.events) {
                this.container.register(EventClass);
                const eventInstance = this.container.resolve(EventClass);
                this._bindEventHandlers(EventClass, eventInstance);
            }
        }

        // 5. Enregistrer et instancier le module lui-même
        this.container.register(ModuleClass);
        const moduleInstance = this.container.resolve(ModuleClass);
        this._bindCronTasks(ModuleClass, moduleInstance);
        this.modules.push({ name: moduleName, instance: moduleInstance, metadata });
    }

    /**
     * Monte les routes d'un contrôleur dans le routeur Express
     * @private
     */
    _mountController(ControllerClass, controllerInstance) {
        const prefix = ControllerClass.__controllerPrefix || '';
        const routes = ControllerClass.__routes || [];

        for (const route of routes) {
            const fullPath = `${prefix}${route.path}`;
            const handler = async (req, res, next) => {
                try {
                    const result = await controllerInstance[route.handlerName](req, res, next);
                    if (result !== undefined && !res.headersSent) {
                        res.json(result);
                    }
                } catch (err) {
                    console.error(`❌ [API Error] ${route.method.toUpperCase()} ${fullPath}:`, err);
                    if (!res.headersSent) {
                        res.status(500).json({ success: false, error: err.message });
                    }
                }
            };

            this.apiRouter[route.method](fullPath, handler);
            console.log(`  🌐 Route API montée : [${route.method.toUpperCase()}] ${fullPath}`);
        }
    }

    /**
     * Branche les méthodes d'écoute d'événements à l'EventBus
     * @private
     */
    _bindEventHandlers(EventClass, eventInstance) {
        const handlers = EventClass.__eventHandlers || [];

        for (const h of handlers) {
            this.eventBus.subscribe(
                h.eventName,
                eventInstance[h.handlerName],
                h.options,
                eventInstance
            );
            console.log(`  🎧 Événement Discord branché : "${h.eventName}" -> ${EventClass.name}.${h.handlerName}`);
        }
    }

    /**
     * Branche les tâches planifiées @Cron
     * @private
     */
    _bindCronTasks(TargetClass, targetInstance) {
        const cronTasks = TargetClass.__cronTasks || [];
        if (cronTasks.length === 0) return;

        const schedulerConfig = (getConfig ? getConfig() : config).scheduler || {};
        const defaultTimezone = schedulerConfig.timezone || 'Europe/Paris';

        for (const task of cronTasks) {
            const options = task.options || {};
            const timezone = options.timezone || defaultTimezone;

            // Fonction de vérification de l'activation
            const isEnabled = () => {
                const currentConf = getConfig ? getConfig() : config;
                if (currentConf.scheduler?.enabled === false) return false;

                if (options.configKey) {
                    const keys = options.configKey.split('.');
                    let val = currentConf;
                    for (const k of keys) {
                        if (val === undefined || val === null) break;
                        val = val[k];
                    }
                    if (val && typeof val === 'object' && val.enabled === false) return false;
                    if (val === false) return false;
                }
                return true;
            };

            const job = cron.schedule(task.cronTime, async () => {
                if (!isEnabled()) return;
                try {
                    await targetInstance[task.handlerName](this.discordClient);
                } catch (err) {
                    console.error(`❌ [Cron Error] ${TargetClass.name}.${task.handlerName}:`, err);
                }
            }, { timezone });

            this.cronJobs.push({
                className: TargetClass.name,
                handlerName: task.handlerName,
                cronTime: task.cronTime,
                job
            });

            console.log(`  ⏰ Tâche Cron planifiée : "${task.cronTime}" (${timezone}) -> ${TargetClass.name}.${task.handlerName}`);
        }
    }

    /**
     * Retourne le routeur Express
     */
    getRouter() {
        return this.apiRouter;
    }

    /**
     * Arrête toutes les tâches cron en cours
     */
    stopCronJobs() {
        for (const c of this.cronJobs) {
            c.job?.stop?.();
        }
        this.cronJobs = [];
    }
}

const defaultModuleManager = new ModuleManager();

module.exports = {
    ModuleManager,
    moduleManager: defaultModuleManager
};
