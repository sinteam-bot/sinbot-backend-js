/**
 * Décorateurs et Helpers de Métadonnées (Style NestJS / Angular)
 * Compatible à 100% avec Node.js natif et TypeScript.
 */

/**
 * Décorateur de Module (@Module)
 * Usage:
 *   @Module({ ... }) class MyModule {}
 *   ou Module({ ... })(class MyModule {})
 */
function Module(options = {}) {
    return function (target) {
        target.__moduleMetadata = {
            imports: options.imports || [],
            providers: options.providers || [],
            controllers: options.controllers || [],
            events: options.events || [],
            commands: options.commands || [],
            exports: options.exports || []
        };
        return target;
    };
}

/**
 * Décorateur de Service (@Injectable)
 */
function Injectable() {
    return function (target) {
        target.__isInjectable = true;
        return target;
    };
}

/**
 * Décorateur de Repository (@Repository)
 */
function Repository() {
    return function (target) {
        target.__isRepository = true;
        return target;
    };
}

/**
 * Décorateur de Contrôleur API Express (@Controller)
 * @param {string} [prefix='']
 */
function Controller(prefix = '') {
    return function (target) {
        target.__controllerPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
        return target;
    };
}

/**
 * Décorateurs de routes HTTP (@Get, @Post, @Put, @Delete)
 */
function createRouteDecorator(method) {
    return function (path = '') {
        return function (target, propertyKey, descriptor) {
            const cleanPath = path.startsWith('/') ? path : `/${path}`;
            const targetClass = typeof target === 'function' ? target : target.constructor;
            
            if (!targetClass.__routes) {
                targetClass.__routes = [];
            }
            targetClass.__routes.push({
                method: method.toLowerCase(),
                path: cleanPath === '/' ? '' : cleanPath,
                handlerName: propertyKey
            });
            return descriptor;
        };
    };
}

const Get = createRouteDecorator('get');
const Post = createRouteDecorator('post');
const Put = createRouteDecorator('put');
const Delete = createRouteDecorator('delete');

/**
 * Décorateur d'Événement Discord (@OnEvent)
 */
function OnEvent(eventName, options = {}) {
    return function (target, propertyKey, descriptor) {
        const targetClass = typeof target === 'function' ? target : target.constructor;
        
        if (!targetClass.__eventHandlers) {
            targetClass.__eventHandlers = [];
        }
        targetClass.__eventHandlers.push({
            eventName,
            handlerName: propertyKey,
            options
        });
        return descriptor;
    };
}

/**
 * Décorateur de Commande Discord (@Command)
 */
function Command(options = {}) {
    return function (target, propertyKey, descriptor) {
        const metadata = typeof options === 'string' ? { name: options } : options;
        const targetClass = typeof target === 'function' ? target : target.constructor;
        
        if (!targetClass.__commands) {
            targetClass.__commands = [];
        }
        targetClass.__commands.push({
            ...metadata,
            handlerName: propertyKey
        });
        return descriptor;
    };
}

/**
 * Décorateur de Tâche Planifiée (@Cron)
 * Usage:
 *   @Cron('0 21 * * *', { timezone: 'Europe/Paris', configKey: 'scheduler.tasks.daily_preview' })
 *   ou Cron('0 21 * * *', { ... })(MyService.prototype, 'myMethod')
 */
function Cron(cronTime, options = {}) {
    return function (target, propertyKey, descriptor) {
        const targetClass = typeof target === 'function' ? target : target.constructor;
        
        if (!targetClass.__cronTasks) {
            targetClass.__cronTasks = [];
        }
        targetClass.__cronTasks.push({
            cronTime,
            handlerName: propertyKey,
            options
        });
        return descriptor;
    };
}

module.exports = {
    Module,
    Injectable,
    Repository,
    Controller,
    Get,
    Post,
    Put,
    Delete,
    OnEvent,
    Command,
    Cron
};
