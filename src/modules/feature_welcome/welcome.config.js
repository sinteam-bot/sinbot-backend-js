const { getConfig, saveModuleConfig } = require('../../config/index.js');

function getWelcomeConfig() {
    const fullConfig = getConfig();
    const w = fullConfig.welcome || {};

    return {
        get WELCOME_CHANNEL_ID() {
            return w.channel_id || '';
        },
        set WELCOME_CHANNEL_ID(val) {
            w.channel_id = val;
            saveModuleConfig('welcome', w);
        },
        get channel_id() {
            return w.channel_id || '';
        },
        set channel_id(val) {
            w.channel_id = val;
            saveModuleConfig('welcome', w);
        },

        get welcome_channel_name() {
            return w.welcome_channel_name || 'bienvenue';
        },
        get welcome_color() {
            return w.welcome_color || '#f2c7ce';
        },

        get AUTO_ROLES() {
            return w.AUTO_ROLES || w.auto_roles || [];
        },
        set AUTO_ROLES(val) {
            w.AUTO_ROLES = val;
            saveModuleConfig('welcome', w);
        },
        get auto_roles() {
            return w.AUTO_ROLES || w.auto_roles || [];
        },

        get WELCOME_MESSAGE() {
            return w.welcome_message || {
                title: '🎉 Bienvenue sur {server} !',
                description: 'Bienvenue {user} !\n\nNous sommes ravis de t\'accueillir parmi nous ! 🎊',
                color: '#f2c7ce',
                footer: 'Membre #{memberCount}',
                thumbnail: 'user',
                image: null,
                fields: [
                    {
                        name: '📚 Pour commencer',
                        value: '• Lis les règles dans <#CHANNEL_REGLES_ID>\n• Présente-toi dans <#CHANNEL_PRESENTATION_ID>\n• N\'hésite pas à poser des questions !',
                        inline: false
                    },
                    {
                        name: '🎮 Commandes utiles',
                        value: '`/help` - Liste des commandes\n`/rank` - Voir ton niveau',
                        inline: true
                    }
                ]
            };
        },
        set WELCOME_MESSAGE(val) {
            w.welcome_message = val;
            saveModuleConfig('welcome', w);
        },
        get welcome_message() {
            return this.WELCOME_MESSAGE;
        },

        get ENABLED() {
            return w.enabled !== undefined ? w.enabled : true;
        },
        set ENABLED(val) {
            w.enabled = val;
            saveModuleConfig('welcome', w);
        },
        get enabled() {
            return this.ENABLED;
        },

        get SEND_DM() {
            return w.dm_message?.enabled !== undefined ? w.dm_message.enabled : (w.SEND_DM ?? true);
        },
        set SEND_DM(val) {
            w.SEND_DM = val;
            if (w.dm_message) w.dm_message.enabled = val;
            saveModuleConfig('welcome', w);
        },

        get DM_MESSAGE() {
            return w.dm_message || {
                title: '👋 Bienvenue !',
                description: 'Salut {username} !\n\nBienvenue sur **{server}** ! Nous espérons que tu vas t\'amuser avec nous. 😊',
                color: '#f2c7ce',
                fields: [
                    {
                        name: '💡 Conseil',
                        value: 'N\'oublie pas de te présenter pour que la communauté apprenne à te connaître !',
                        inline: false
                    }
                ]
            };
        },
        set DM_MESSAGE(val) {
            w.dm_message = val;
            saveModuleConfig('welcome', w);
        },
        get dm_message() {
            return this.DM_MESSAGE;
        },

        get LOG_TO_CONSOLE() {
            return w.LOG_TO_CONSOLE !== undefined ? w.LOG_TO_CONSOLE : true;
        }
    };
}

module.exports = new Proxy({}, {
    get(target, prop) {
        const conf = getWelcomeConfig();
        if (prop in conf) {
            return conf[prop];
        }
        return getConfig().welcome?.[prop];
    },
    set(target, prop, value) {
        const conf = getWelcomeConfig();
        conf[prop] = value;
        return true;
    },
    ownKeys() {
        const conf = getWelcomeConfig();
        return Array.from(new Set([...Object.keys(conf), ...Object.keys(getConfig().welcome || {})]));
    },
    getOwnPropertyDescriptor(target, prop) {
        return {
            enumerable: true,
            configurable: true,
            value: this.get(target, prop)
        };
    }
});
