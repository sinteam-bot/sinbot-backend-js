/**
 * src/modules/util_teamspeak/services/teamspeak-client.service.js
 *
 * Service de gestion de la connexion TeamSpeak 3 via ts3-nodejs-library.
 * Supporte reconnexion automatique, cache en mémoire et diffusion d'événements.
 */

const { EventEmitter } = require('events');
const { TeamSpeak, QueryProtocol } = require('ts3-nodejs-library');
const { Injectable } = require('../../../core/index.js');
const logger = require('../../../utils/logger.js');

class TeamSpeakClientService extends EventEmitter {
    static inject = [];

    constructor() {
        super();
        this._ts3 = null;
        this._connected = false;
        this._connecting = false;
        this._config = null;
        this._reconnectTimer = null;
        this._reconnectAttempts = 0;

        // Cache local réactif
        this._channels = [];
        this._clients = [];
        this._serverInfo = {
            online: false,
            name: 'TeamSpeak 3 Server',
            host: '127.0.0.1',
            port: 9987,
            clientsOnline: 0,
            maxClients: 32,
            uptime: 0
        };
    }

    /**
     * Définit ou met à jour la configuration serveur TS3.
     * @param {Object} config
     */
    setConfig(config) {
        this._config = config || {};
        this._serverInfo.host = this._resolveHost();
        this._serverInfo.port = this._resolveServerPort();
    }

    _resolveHost() {
        return this._config?.server?.host || process.env.TS3_HOST || '127.0.0.1';
    }

    _resolveQueryPort() {
        return Number(this._config?.server?.queryport || process.env.TS3_QUERY_PORT || 10011);
    }

    _resolveServerPort() {
        return Number(this._config?.server?.serverport || process.env.TS3_SERVER_PORT || 9987);
    }

    _resolveUsername() {
        return this._config?.server?.username || process.env.TS3_USERNAME || 'serveradmin';
    }

    _resolvePassword() {
        return this._config?.server?.password || process.env.TS3_PASSWORD || '';
    }

    _resolveNickname() {
        return this._config?.server?.nickname || process.env.TS3_NICKNAME || 'DiscordTS3Widget';
    }

    _resolveProtocol() {
        const proto = (this._config?.server?.protocol || process.env.TS3_PROTOCOL || 'raw').toLowerCase();
        return proto === 'ssh' ? QueryProtocol.SSH : QueryProtocol.RAW;
    }

    /**
     * Indique si la configuration est prête pour tenter une connexion.
     */
    isConfigured() {
        const password = this._resolvePassword();
        const host = this._resolveHost();
        // Si mot de passe ou host absent, la connexion ne peut aboutir
        return Boolean(host && password && password.trim().length > 0);
    }

    /**
     * Établit la connexion avec le serveur TeamSpeak 3.
     */
    async connect() {
        if (this._connected && this._ts3) {
            return this._ts3;
        }

        if (this._connecting) {
            return null;
        }

        if (!this.isConfigured()) {
            logger.info('TeamSpeak 3 en attente de configuration (mot de passe query ou host manquant).', 'TEAMSPEAK');
            this._serverInfo.online = false;
            return null;
        }

        this._connecting = true;

        const host = this._resolveHost();
        const queryport = this._resolveQueryPort();
        const serverport = this._resolveServerPort();
        const username = this._resolveUsername();
        const password = this._resolvePassword();
        const nickname = this._resolveNickname();
        const protocol = this._resolveProtocol();

        const connectionParams = {
            host,
            queryport,
            serverport,
            protocol,
            username,
            password,
            nickname,
            readyTimeout: Number(this._config?.server?.readyTimeout || 10000),
            keepAlive: this._config?.server?.keepAlive !== false,
            antiflood: true
        };

        try {
            logger.info(`Connexion à TeamSpeak 3 (${host}:${serverport}) en cours...`, 'TEAMSPEAK');

            this._ts3 = await TeamSpeak.connect(connectionParams);
            this._connected = true;
            this._connecting = false;
            this._reconnectAttempts = 0;
            this._serverInfo.online = true;

            logger.info(`Connecté avec succès à TeamSpeak 3 en tant que "${nickname}".`, 'TEAMSPEAK');

            // Enregistrer l'écoute des événements du serveur
            this._setupEventListeners();

            // Souscrire aux notifications ServerQuery pour recevoir les événements
            await this._registerNotifications();

            // Remplir le cache initial
            await this.refreshCache();

            this.emit('connected', { serverInfo: this._serverInfo });
            return this._ts3;
        } catch (err) {
            this._connected = false;
            this._connecting = false;
            this._serverInfo.online = false;
            logger.warn(`Échec de connexion à TeamSpeak 3: ${err.message}`, 'TEAMSPEAK');

            this.emit('error', err);
            this._scheduleReconnect();
            return null;
        }
    }

    /**
     * Souscrit aux notifications serveur (servernotifyregister).
     * @private
     */
    async _registerNotifications() {
        if (!this._ts3) return;
        try {
            // Notification serveur (clientconnect, clientdisconnect)
            await this._ts3.registerEvent('server');
        } catch (err) {
            logger.warn(`Impossible d'enregistrer l'événement server TS3: ${err.message}`, 'TEAMSPEAK');
        }

        try {
            // Notification canal (clientmoved, channelcreate, channeldelete, etc.) sur tous les salons (id: 0)
            await this._ts3.registerEvent('channel', 0);
        } catch (err) {
            logger.warn(`Impossible d'enregistrer l'événement channel TS3: ${err.message}`, 'TEAMSPEAK');
        }
    }

    /**
     * Attache les écouteurs d'événements à l'instance TeamSpeak.
     * @private
     */
    _setupEventListeners() {
        if (!this._ts3) return;

        // Événement d'erreur de la socket TS3 (évite le plantage du processus Node.js)
        this._ts3.on('error', (err) => {
            logger.warn(`Erreur socket TeamSpeak 3: ${err.message}`, 'TEAMSPEAK');
            this.emit('error', err);
        });

        // Fermeture de la connexion
        this._ts3.on('close', () => {
            logger.warn('Connexion TeamSpeak 3 fermée.', 'TEAMSPEAK');
            this._connected = false;
            this._serverInfo.online = false;
            this.emit('disconnected');
            this._scheduleReconnect();
        });

        // Connexion d'un utilisateur
        this._ts3.on('clientconnect', (ev) => {
            this.emit('clientconnect', ev);
            this.refreshCache().catch(() => {});
        });

        // Déconnexion d'un utilisateur
        this._ts3.on('clientdisconnect', (ev) => {
            this.emit('clientdisconnect', ev);
            this.refreshCache().catch(() => {});
        });

        // Déplacement d'un utilisateur
        this._ts3.on('clientmoved', (ev) => {
            this.emit('clientmoved', ev);
            this.refreshCache().catch(() => {});
        });

        // Salons créés, modifiés ou supprimés
        this._ts3.on('channelcreate', (ev) => {
            this.emit('channelcreate', ev);
            this.refreshCache().catch(() => {});
        });

        this._ts3.on('channeldelete', (ev) => {
            this.emit('channeldelete', ev);
            this.refreshCache().catch(() => {});
        });

        this._ts3.on('channeledit', (ev) => {
            this.emit('channeledit', ev);
            this.refreshCache().catch(() => {});
        });

        // Édition des paramètres serveur
        this._ts3.on('serveredit', (ev) => {
            this.emit('serveredit', ev);
            this.refreshCache().catch(() => {});
        });
    }

    /**
     * Planifie une reconnexion avec backoff exponentiel.
     * @private
     */
    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        if (!this.isConfigured()) return;

        this._reconnectAttempts++;
        const delays = [5000, 10000, 20000, 30000, 60000];
        const delay = delays[Math.min(this._reconnectAttempts - 1, delays.length - 1)];

        logger.info(`Nouvelle tentative de connexion TeamSpeak 3 dans ${Math.round(delay / 1000)}s...`, 'TEAMSPEAK');

        this._reconnectTimer = setTimeout(async () => {
            this._reconnectTimer = null;
            await this.connect();
        }, delay);
    }

    /**
     * Déconnecte le client TeamSpeak 3 proprement.
     */
    async disconnect() {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }

        if (this._ts3) {
            try {
                this._ts3.removeAllListeners();
                await this._ts3.quit();
            } catch (err) {
                // Ignore silent quit error
            }
            this._ts3 = null;
        }

        this._connected = false;
        this._serverInfo.online = false;
        this.emit('disconnected');
    }

    /**
     * Actualise les canaux, clients et métadonnées du serveur.
     */
    async refreshCache() {
        if (!this._connected || !this._ts3) {
            return this.getTreeData();
        }

        try {
            const [channels, clients, sInfo] = await Promise.all([
                this._ts3.channelList().catch(() => this._channels),
                this._ts3.clientList().catch(() => this._clients),
                this._ts3.serverInfo().catch(() => null)
            ]);

            this._channels = channels || [];
            this._clients = clients || [];

            if (sInfo) {
                this._serverInfo = {
                    online: true,
                    name: sInfo.virtualserver_name || this._serverInfo.name,
                    version: sInfo.virtualserver_version,
                    platform: sInfo.virtualserver_platform,
                    clientsOnline: sInfo.virtualserver_clientsonline || this._clients.length,
                    maxClients: sInfo.virtualserver_maxclients || 32,
                    channelsOnline: sInfo.virtualserver_channelsonline || this._channels.length,
                    uptime: sInfo.virtualserver_uptime || 0,
                    host: this._resolveHost(),
                    serverport: this._resolveServerPort()
                };
            } else {
                this._serverInfo.clientsOnline = this._clients.length;
                this._serverInfo.channelsOnline = this._channels.length;
                this._serverInfo.online = true;
            }

            this.emit('cacheUpdated', this.getTreeData());
            return this.getTreeData();
        } catch (err) {
            logger.warn(`Erreur actualisation cache TS3: ${err.message}`, 'TEAMSPEAK');
            return this.getTreeData();
        }
    }

    /**
     * Retourne les données actuelles d'arborescence (canaux, clients, serveur).
     */
    getTreeData() {
        return {
            online: this._connected,
            channels: [...this._channels],
            clients: [...this._clients],
            serverInfo: { ...this._serverInfo }
        };
    }

    /**
     * Statut de connexion courant.
     */
    isConnected() {
        return this._connected;
    }

    /**
     * Informations sur le serveur.
     */
    getServerInfo() {
        return { ...this._serverInfo };
    }
}

Injectable()(TeamSpeakClientService);

module.exports = { TeamSpeakClientService };
