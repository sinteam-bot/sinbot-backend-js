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
        if (typeof client.guilds.cache.first === 'function') return client.guilds.cache.first();
        if (typeof client.guilds.cache.values === 'function') return client.guilds.cache.values().next()?.value || null;
        return null;
    };

    if (guildId && client.guilds) {
        try {
            if (typeof client.guilds.fetch === 'function') {
                const g = await client.guilds.fetch(guildId).catch(() => client.guilds?.cache?.get?.(guildId));
                if (g) return g;
            }
        } catch {
            return client.guilds?.cache?.get?.(guildId) || getFirstFromCache();
        }
    }

    if (typeof client.guilds?.fetch === 'function') {
        try {
            const fetched = await client.guilds.fetch().catch(() => null);
            if (fetched) {
                if (typeof fetched.first === 'function') return fetched.first();
                if (typeof fetched.values === 'function') {
                    const firstVal = fetched.values().next()?.value;
                    if (firstVal) return firstVal;
                }
                if (fetched.id && fetched.name) return fetched;
            }
        } catch {
            // ignore
        }
    }

    return getFirstFromCache();
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
