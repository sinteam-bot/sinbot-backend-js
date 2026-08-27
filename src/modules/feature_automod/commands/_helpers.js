/**
 * Helpers pour les commandes de modération
 */

function requireModPermission(interaction, allowedRoles = []) {
    if (!interaction.member) return { ok: false, reason: 'no_member' };
    if (interaction.member.permissions?.has?.('ModerateMembers')) return { ok: true };
    if (allowedRoles.length === 0) return { ok: true };
    const has = allowedRoles.some(rid => interaction.member.roles?.cache?.has(rid));
    return has ? { ok: true } : { ok: false, reason: 'missing_role' };
}

function replyError(interaction, message) {
    return interaction.reply({ content: `❌ ${message}`, ephemeral: true });
}

module.exports = { requireModPermission, replyError };
