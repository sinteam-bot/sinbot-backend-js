/**
 * src/web/controllers/discord-helpers.js
 *
 * Fonctions utilitaires partagées par les contrôleurs web Discord.
 */

async function getGuild(client) {
    if (!client || (typeof client.isReady === 'function' && !client.isReady())) return null;
    const guildId = process.env.GUILD_ID;
    if (guildId && client.guilds) {
        try {
            return await client.guilds.fetch(guildId).catch(() => client.guilds?.cache?.get(guildId));
        } catch {
            return client.guilds?.cache?.get(guildId) || client.guilds?.cache?.first() || null;
        }
    }
    return client.guilds?.cache?.first() || null;
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
