const { getConfig, saveModuleConfig } = require('../../config/index.js');

function getStartupNotifierConfig() {
    const fullConfig = getConfig ? getConfig() : {};
    const c = fullConfig.startup_notifier || {};
    const gh = c.github || {};

    const githubObj = {
        REPO: gh.repo || process.env.GITHUB_REPO || 'sinteam-bot/chienne-bot',
        TOKEN: gh.token || process.env.GITHUB_TOKEN || null,
        repo: gh.repo || process.env.GITHUB_REPO || 'sinteam-bot/chienne-bot',
        token: gh.token || process.env.GITHUB_TOKEN || null
    };

    return {
        get ENABLED() { return c.enabled !== undefined ? c.enabled : true; },
        set ENABLED(v) { c.enabled = v; saveModuleConfig('startup_notifier', c); },
        get enabled() { return this.ENABLED; },
        set enabled(v) { this.ENABLED = v; },

        get CHANNEL_ID() { return c.channel_id || process.env.LOG_CHANNEL_ID || null; },
        set CHANNEL_ID(v) { c.channel_id = v; saveModuleConfig('startup_notifier', c); },
        get channel_id() { return this.CHANNEL_ID; },
        set channel_id(v) { this.CHANNEL_ID = v; },

        get NOTIFY_ON_UPDATE_ONLY() { return c.notify_on_update_only ?? false; },
        set NOTIFY_ON_UPDATE_ONLY(v) { c.notify_on_update_only = v; saveModuleConfig('startup_notifier', c); },
        get notify_on_update_only() { return this.NOTIFY_ON_UPDATE_ONLY; },
        set notify_on_update_only(v) { this.NOTIFY_ON_UPDATE_ONLY = v; },

        get INCLUDE_GIT_HISTORY() { return c.include_git_history ?? true; },
        set INCLUDE_GIT_HISTORY(v) { c.include_git_history = v; saveModuleConfig('startup_notifier', c); },
        get include_git_history() { return this.INCLUDE_GIT_HISTORY; },
        set include_git_history(v) { this.INCLUDE_GIT_HISTORY = v; },

        get EMBED_COLOR() { return c.embed_color || '#f2c7ce'; },
        set EMBED_COLOR(v) { c.embed_color = v; saveModuleConfig('startup_notifier', c); },
        get embed_color() { return this.EMBED_COLOR; },
        set embed_color(v) { this.EMBED_COLOR = v; },

        github: githubObj
    };
}

const STARTUP_NOTIFIER_CONFIG = new Proxy({}, {
    get(target, prop) {
        const conf = getStartupNotifierConfig();
        return conf[prop];
    },
    set(target, prop, value) {
        const conf = getStartupNotifierConfig();
        conf[prop] = value;
        return true;
    }
});

module.exports = STARTUP_NOTIFIER_CONFIG;
