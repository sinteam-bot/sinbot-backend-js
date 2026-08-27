const EventEmitter = require('events');
const { config, getConfig } = require('../config/index.js');

/**
 * Bus d'événements Pub/Sub interne pour Discord
 * Centralise les écouteurs Discord.js pour éliminer les souscriptions multiples
 * et offre un filtrage et ordonnancement déclaratif.
 */
class DiscordEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(100);
        this.client = null;
        this.registeredDiscordEvents = new Set();
        this.subscriptions = new Map(); // eventName -> Array<{ handler, options, context }>
    }

    /**
     * Attache le client Discord au bus
     * @param {import('discord.js').Client} discordClient
     */
    init(discordClient) {
        this.client = discordClient;
        console.log('⚡ [EventBus] Bus d\'événements Discord initialisé.');

        // Attacher les écouteurs de mise en cache BDD en temps réel avec Soft Delete
        try {
            const DiscordCacheService = require('../services/discordCacheService.js');

            discordClient.on('guildMemberAdd', member => {
                DiscordCacheService.cacheSingleMember(member).catch(() => {});
            });
            discordClient.on('guildMemberUpdate', (oldM, newM) => {
                DiscordCacheService.cacheSingleMember(newM).catch(() => {});
            });
            discordClient.on('guildMemberRemove', member => {
                DiscordCacheService.softDeleteMember(member.id).catch(() => {});
            });
            discordClient.on('roleCreate', role => {
                if (role.guild) DiscordCacheService.cacheGuildRoles(role.guild).catch(() => {});
            });
            discordClient.on('roleUpdate', (oldR, newR) => {
                if (newR.guild) DiscordCacheService.cacheGuildRoles(newR.guild).catch(() => {});
            });
            discordClient.on('roleDelete', role => {
                DiscordCacheService.softDeleteRole(role.id).catch(() => {});
            });
            discordClient.on('emojiCreate', emoji => {
                if (emoji.guild) DiscordCacheService.cacheGuildEmojis(emoji.guild).catch(() => {});
            });
            discordClient.on('emojiUpdate', (oldE, newE) => {
                if (newE.guild) DiscordCacheService.cacheGuildEmojis(newE.guild).catch(() => {});
            });
            discordClient.on('emojiDelete', emoji => {
                DiscordCacheService.softDeleteEmoji(emoji.id).catch(() => {});
            });
            discordClient.on('channelCreate', ch => {
                if (ch.guild) DiscordCacheService.cacheGuildChannels(ch.guild).catch(() => {});
            });
            discordClient.on('channelUpdate', (oldC, newC) => {
                if (newC.guild) DiscordCacheService.cacheGuildChannels(newC.guild).catch(() => {});
            });
            discordClient.on('channelDelete', ch => {
                DiscordCacheService.softDeleteChannel(ch.id).catch(() => {});
            });
            discordClient.on('threadDelete', thread => {
                DiscordCacheService.softDeleteChannel(thread.id).catch(() => {});
            });
            discordClient.on('messageDelete', message => {
                DiscordCacheService.softDeleteMessage(message.id).catch(() => {});
            });
            discordClient.on('messageDeleteBulk', messages => {
                const ids = Array.from(messages.keys ? messages.keys() : messages.map(m => m.id));
                DiscordCacheService.softDeleteMessages(ids).catch(() => {});
            });
        } catch (err) {
            console.error('⚠️ [EventBus] Impossible d\'attacher les écouteurs de cache BDD:', err.message);
        }
    }

    /**
     * S'abonne à un événement Discord via le bus interne
     * @param {string} eventName - Nom de l'événement Discord (ex: 'messageCreate', 'clientReady')
     * @param {Function} handler - Fonction de traitement
     * @param {Object} [options={}] - Options de filtrage
     * @param {string} [options.configKey] - Clé de configuration dans config.yml (ex: 'counter')
     * @param {string} [options.channelId] - Filtrage automatique par salon Discord
     * @param {boolean} [options.ignoreBots=true] - Ignorer les bots automatiquement
     * @param {number} [options.priority=0] - Priorité d'exécution (les plus hautes d'abord)
     * @param {Function} [options.filter] - Prédicat personnalisé (args) => boolean
     * @param {Object} [context=null] - Instance de la classe appelante (this)
     */
    subscribe(eventName, handler, options = {}, context = null) {
        if (!this.subscriptions.has(eventName)) {
            this.subscriptions.set(eventName, []);
        }

        const sub = {
            handler,
            options: {
                ignoreBots: true,
                priority: 0,
                ...options
            },
            context
        };

        const list = this.subscriptions.get(eventName);
        list.push(sub);
        list.sort((a, b) => b.options.priority - a.options.priority);

        // Si le bus est attaché au client Discord, s'assurer que Discord écoute cet événement
        this._ensureDiscordListener(eventName);
    }

    /**
     * Enregistre un listener unique sur Discord.js si ce n'est pas déjà fait
     * @private
     */
    _ensureDiscordListener(eventName) {
        if (!this.client || this.registeredDiscordEvents.has(eventName)) {
            return;
        }

        this.registeredDiscordEvents.add(eventName);

        if (eventName === 'clientReady' || eventName === 'ready') {
            this.client.once('clientReady', (...args) => {
                this.dispatch('clientReady', ...args);
            });
        } else {
            this.client.on(eventName, (...args) => {
                this.dispatch(eventName, ...args);
            });
        }

        console.log(`🔌 [EventBus] Listener Discord unique enregistré pour: "${eventName}"`);
    }

    /**
     * Distribue l'événement à tous les abonnés enregistrés
     * @param {string} eventName
     * @param  {...any} args
     */
    async dispatch(eventName, ...args) {
        const subs = this.subscriptions.get(eventName);
        if (!subs || subs.length === 0) return;

        const currentConfig = getConfig ? getConfig() : config;

        for (const sub of subs) {
            try {
                const { handler, options, context } = sub;

                // 1. Vérification de la configuration du module
                if (options.configKey) {
                    const modConfig = currentConfig[options.configKey];
                    if (modConfig && modConfig.enabled === false) {
                        continue;
                    }
                }

                // 2. Filtrage spécial pour les messages Discord
                if (eventName === 'messageCreate') {
                    const message = args[0];
                    if (!message) continue;

                    // Ignorer les bots si activé
                    if (options.ignoreBots && message.author?.bot) {
                        continue;
                    }

                    // Filtrer par ID de canal si spécifié
                    if (options.channelId && message.channel?.id !== options.channelId) {
                        continue;
                    }
                }

                // 3. Prédicat personnalisé
                if (typeof options.filter === 'function') {
                    const passed = options.filter(...args);
                    if (!passed) continue;
                }

                // Exécution du gestionnaire avec isolation des erreurs
                if (context) {
                    await handler.apply(context, args);
                } else {
                    await handler(...args);
                }

            } catch (err) {
                console.error(`❌ [EventBus] Erreur dans le gestionnaire pour "${eventName}":`, err);
            }
        }
    }
}

const defaultEventBus = new DiscordEventBus();

module.exports = {
    DiscordEventBus,
    eventBus: defaultEventBus
};
