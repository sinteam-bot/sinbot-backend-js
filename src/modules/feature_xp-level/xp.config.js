const { getConfig, saveModuleConfig } = require('../../config/index.js');

function getXpConfig() {
    const fullConfig = getConfig();
    const x = fullConfig.welcome?.xp || fullConfig.xp || {};
    const msgXp = x.message_xp || x.MESSAGE_XP || {};
    const voiceXp = x.voice_xp || x.VOICE_XP || {};
    const levelConf = x.level || x.LEVEL || {};
    const bonusConf = x.bonus || x.BONUS || {};
    const limitsConf = x.limits || x.LIMITS || {};
    const rolesConf = x.level_roles || x.LEVEL_ROLES || {};

    const messageXpObj = {
        MIN: msgXp.min ?? msgXp.MIN ?? 15,
        MAX: msgXp.max ?? msgXp.MAX ?? 25,
        COOLDOWN: msgXp.cooldown ?? msgXp.COOLDOWN ?? 10,
        min: msgXp.min ?? 15,
        max: msgXp.max ?? 25,
        cooldown: msgXp.cooldown ?? 10
    };

    const voiceXpObj = {
        PER_MINUTE: voiceXp.per_minute ?? voiceXp.PER_MINUTE ?? 2,
        CHECK_INTERVAL: voiceXp.check_interval ?? voiceXp.CHECK_INTERVAL ?? 5,
        MIN_DURATION: voiceXp.min_duration ?? voiceXp.MIN_DURATION ?? 1,
        per_minute: voiceXp.per_minute ?? 2,
        check_interval: voiceXp.check_interval ?? 5,
        min_duration: voiceXp.min_duration ?? 1
    };

    const levelObj = {
        BASE_XP: levelConf.base_xp ?? levelConf.BASE_XP ?? 100,
        MULTIPLIER: levelConf.multiplier ?? levelConf.MULTIPLIER ?? 1.5,
        base_xp: levelConf.base_xp ?? 100,
        multiplier: levelConf.multiplier ?? 1.5
    };

    const bonusObj = {
        DAILY_FIRST_MESSAGE: bonusConf.daily_first_message ?? bonusConf.DAILY_FIRST_MESSAGE ?? 50,
        STREAK_MULTIPLIER: bonusConf.streak_multiplier ?? bonusConf.STREAK_MULTIPLIER ?? 1.1,
        EVENT_MULTIPLIER: bonusConf.event_multiplier ?? bonusConf.EVENT_MULTIPLIER ?? 2,
        daily_first_message: bonusConf.daily_first_message ?? 50,
        streak_multiplier: bonusConf.streak_multiplier ?? 1.1,
        event_multiplier: bonusConf.event_multiplier ?? 2
    };

    const limitsObj = {
        MAX_XP_PER_DAY: limitsConf.max_xp_per_day ?? limitsConf.MAX_XP_PER_DAY ?? 5000,
        MAX_MESSAGES_PER_MINUTE: limitsConf.max_messages_per_minute ?? limitsConf.MAX_MESSAGES_PER_MINUTE ?? 5,
        max_xp_per_day: limitsConf.max_xp_per_day ?? 5000,
        max_messages_per_minute: limitsConf.max_messages_per_minute ?? 5
    };

    const rolesObj = {
        5: rolesConf['5'] || rolesConf[5] || 'Membre Actif',
        10: rolesConf['10'] || rolesConf[10] || 'Membre Dévoué',
        20: rolesConf['20'] || rolesConf[20] || 'Vétéran',
        30: rolesConf['30'] || rolesConf[30] || 'Légende',
        50: rolesConf['50'] || rolesConf[50] || 'Dieu du serveur',
        ...rolesConf
    };

    return {
        get ENABLED() { return x.enabled !== undefined ? x.enabled : false; },
        set ENABLED(v) { x.enabled = v; saveModuleConfig('xp', x); },
        get enabled() { return this.ENABLED; },

        get MESSAGE_XP() { return messageXpObj; },
        get message_xp() { return messageXpObj; },

        get VOICE_XP() { return voiceXpObj; },
        get voice_xp() { return voiceXpObj; },

        get LEVEL() { return levelObj; },
        get level() { return levelObj; },

        get BONUS() { return bonusObj; },
        get bonus() { return bonusObj; },

        get LIMITS() { return limitsObj; },
        get limits() { return limitsObj; },

        get LEVEL_ROLES() { return rolesObj; },
        get level_roles() { return rolesObj; }
    };
}

module.exports = new Proxy({}, {
    get(target, prop) {
        const conf = getXpConfig();
        if (prop in conf) {
            return conf[prop];
        }
        const x = getConfig().welcome?.xp || getConfig().xp || {};
        return x[prop];
    },
    set(target, prop, value) {
        const fullConfig = getConfig();
        fullConfig.welcome = fullConfig.welcome || {};
        fullConfig.welcome.xp = fullConfig.welcome.xp || {};
        fullConfig.welcome.xp[prop] = value;
        saveModuleConfig('xp', fullConfig.welcome.xp);
        return true;
    },
    ownKeys() {
        const conf = getXpConfig();
        const x = getConfig().welcome?.xp || getConfig().xp || {};
        return Array.from(new Set([...Object.keys(conf), ...Object.keys(x)]));
    },
    getOwnPropertyDescriptor(target, prop) {
        return {
            enumerable: true,
            configurable: true,
            value: this.get(target, prop)
        };
    }
});
