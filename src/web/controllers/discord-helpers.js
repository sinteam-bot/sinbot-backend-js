/**
 * src/web/controllers/discord-helpers.js
 *
 * Fonctions utilitaires partagées par les contrôleurs web Discord.
 */

async function getGuild(client) {
    if (!client || (typeof client.isReady === 'function' && !client.isReady())) return null;
    const guildId = process.env.GUILD_ID;
    const getFirstFromCache = () => {
        if (!client.guilds?.cache) return null;
        if (typeof client.guilds.cache.first === 'function') {
            const g = client.guilds.cache.first();
            if (g) return g;
        }
        if (typeof client.guilds.cache.values === 'function') {
            const g = client.guilds.cache.values().next()?.value;
            if (g) return g;
        }
        return null;
    };

    if (guildId && client.guilds) {
        try {
            if (typeof client.guilds.fetch === 'function') {
                const g = await client.guilds.fetch(guildId).catch(() => client.guilds?.cache?.get?.(guildId));
                if (g && (g.channels || !g.fetch)) return g;
            }
        } catch {
            const cached = client.guilds?.cache?.get?.(guildId) || getFirstFromCache();
            if (cached) return cached;
        }
    }

    const cached = getFirstFromCache();
    if (cached && (cached.channels || !cached.fetch)) return cached;

    if (typeof client.guilds?.fetch === 'function') {
        try {
            const fetched = await client.guilds.fetch().catch(() => null);
            if (fetched) {
                let target = null;
                if (typeof fetched.first === 'function') target = fetched.first();
                else if (typeof fetched.values === 'function') target = fetched.values().next()?.value;
                else if (fetched.id) target = fetched;

                if (target?.id && !target.channels) {
                    // Si c'est un OAuth2Guild sans salon, fetch la Guilde complète par son ID
                    const fullGuild = await client.guilds.fetch(target.id).catch(() => target);
                    if (fullGuild) return fullGuild;
                }
                if (target) return target;
            }
        } catch {
            // ignore
        }
    }

    return cached;
}

function getUserAvatar(user, member = null) {
    if (member && member.avatar && member.guild) {
        return `https://cdn.discordapp.com/guilds/${member.guild.id}/users/${user.id}/avatars/${member.avatar}.png?size=128`;
    }
    if (user && user.avatar) {
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
    }
    const defaultIndex = user ? (Number(user.id) % 5) : 0;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
}

module.exports = {
    getGuild,
    getUserAvatar
};
