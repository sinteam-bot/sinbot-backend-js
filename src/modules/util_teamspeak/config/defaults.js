/**
 * src/modules/util_teamspeak/config/defaults.js
 *
 * Configuration par défaut du module TeamSpeak 3 (Widget & Logs).
 */

module.exports = {
    enabled: false,
    allowed_roles: [],
    server: {
        host: '127.0.0.1',
        queryport: 10011,
        serverport: 9987,
        protocol: 'raw', // 'raw' ou 'ssh'
        username: 'serveradmin',
        password: '',
        nickname: 'DiscordTS3Widget',
        readyTimeout: 10000,
        keepAlive: true
    },
    widget: {
        enabled: true,
        channel_id: null,
        message_id: null,
        refresh_interval_seconds: 30,
        title: '🔊 Serveur TeamSpeak 3',
        color: '#2580EB',
        hide_empty_channels: false,
        show_query_clients: false,
        show_channel_ids: true
    },
    logs: {
        enabled: true,
        channel_id: null,
        color: '#2580EB',
        events: {
            client_connect: true,
            client_disconnect: true,
            client_moved: true,
            channel_create: true,
            channel_delete: true,
            server_edit: false
        }
    }
};
