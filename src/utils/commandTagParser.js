/**
 * src/utils/commandTagParser.js
 *
 * Moteur de parsing pour les tags de commandes personnalisées et automations (Phase 8 G44, G19, G43).
 *
 * Supporte :
 *  - Arguments positionnels : {1}, {2}, {1:valeur_par_defaut}, {2:aucun}
 *  - Tous les arguments : {args}, {args:valeur_par_defaut}
 *  - Variables utilisateur : {user}, {user.name}, {user.tag}, {user.id}, {user.mention}
 *  - Variables XP / Économie : {user.level}, {user.xp}, {user.coins}, {user.balance}
 *  - Variables serveur / salon : {server.name}, {server.id}, {server.member_count}, {channel.name}, {channel.id}, {channel.mention}
 *  - Actions Discord : {add-role:ROLE_ID}, {remove-role:ROLE_ID}, {delete}
 */

const logger = require('./logger.js');

/**
 * Parse et remplace les balises de template, et extrait / applique les actions Discord.
 *
 * @param {string} template Texte brut contenant les balises {tag}
 * @param {object} context Contexte d'exécution
 * @param {object} [context.member] GuildMember Discord
 * @param {object} [context.user] User Discord
 * @param {object} [context.guild] Guild Discord
 * @param {object} [context.channel] Channel Discord
 * @param {object} [context.message] Message Discord
 * @param {string[]} [context.args] Arguments passés après la commande
 * @param {number} [context.level] Niveau XP
 * @param {number} [context.xp] Montant XP
 * @param {number} [context.coins] Solde de monnaie
 * @param {object} [options] Options
 * @param {boolean} [options.executeActions=true] Si true, exécute les actions de rôles et delete
 * @returns {Promise<{ text: string, actions: Array<{ type: string, targetId?: string }> }>}
 */
async function parseCommandTags(template, context = {}, options = { executeActions: true }) {
    if (!template || typeof template !== 'string') {
        return { text: '', actions: [] };
    }

    const {
        member,
        user = member?.user,
        guild = member?.guild,
        channel,
        message,
        args = [],
        level = 1,
        xp = 0,
        coins = 0
    } = context;

    let output = template;
    const actions = [];

    // 1. Détection des actions Discord ({add-role:ID}, {remove-role:ID}, {delete})
    // {add-role:123456789012345678}
    const addRoleRegex = /\{add-role:([0-9]{17,20})\}/gi;
    let match;
    while ((match = addRoleRegex.exec(output)) !== null) {
        actions.push({ type: 'add-role', targetId: match[1] });
    }
    output = output.replace(addRoleRegex, '');

    // {remove-role:123456789012345678}
    const removeRoleRegex = /\{remove-role:([0-9]{17,20})\}/gi;
    while ((match = removeRoleRegex.exec(output)) !== null) {
        actions.push({ type: 'remove-role', targetId: match[1] });
    }
    output = output.replace(removeRoleRegex, '');

    // {delete}
    if (/\{delete\}/i.test(output)) {
        actions.push({ type: 'delete' });
        output = output.replace(/\{delete\}/gi, '');
    }

    // 2. Exécution des actions sur Discord si demandé et si le contexte le permet
    if (options.executeActions !== false) {
        for (const action of actions) {
            try {
                if (action.type === 'add-role' && member?.roles?.add) {
                    await member.roles.add(action.targetId).catch(err => {
                        logger.warn(`Impossible d'ajouter le rôle ${action.targetId} à ${member.id}: ${err.message}`, 'TAG_PARSER');
                    });
                } else if (action.type === 'remove-role' && member?.roles?.remove) {
                    await member.roles.remove(action.targetId).catch(err => {
                        logger.warn(`Impossible de retirer le rôle ${action.targetId} à ${member.id}: ${err.message}`, 'TAG_PARSER');
                    });
                } else if (action.type === 'delete' && message?.delete) {
                    await message.delete().catch(err => {
                        logger.warn(`Impossible de supprimer le message ${message.id}: ${err.message}`, 'TAG_PARSER');
                    });
                }
            } catch (err) {
                logger.warn(`Erreur exécution action ${action.type}: ${err.message}`, 'TAG_PARSER');
            }
        }
    }

    // 3. Remplacement des arguments positionnels avec fallback ({1:defaut}, {1}, {2}, etc.)
    output = output.replace(/\{(\d+)(?::([^}]*))?\}/g, (fullMatch, indexStr, fallback) => {
        const index = parseInt(indexStr, 10) - 1;
        if (index >= 0 && index < args.length && args[index] !== undefined && args[index] !== '') {
            return args[index];
        }
        return fallback !== undefined ? fallback : '';
    });

    // {args} ou {args:defaut}
    output = output.replace(/\{args(?::([^}]*))?\}/gi, (fullMatch, fallback) => {
        if (args.length > 0) {
            return args.join(' ');
        }
        return fallback !== undefined ? fallback : '';
    });

    // 4. Remplacement des variables utilisateur
    const username = user?.username || 'Utilisateur';
    const displayName = member?.displayName || user?.globalName || username;
    const userId = user?.id || '0';
    const tag = user?.tag || username;
    const userMention = `<@${userId}>`;

    output = output.replace(/\{user\}/gi, displayName);
    output = output.replace(/\{user\.name\}/gi, username);
    output = output.replace(/\{user\.display_name\}/gi, displayName);
    output = output.replace(/\{user\.tag\}/gi, tag);
    output = output.replace(/\{user\.id\}/gi, userId);
    output = output.replace(/\{user\.mention\}/gi, userMention);

    // 5. Remplacement des variables XP / Économie
    output = output.replace(/\{user\.level\}/gi, String(level));
    output = output.replace(/\{user\.xp\}/gi, String(xp));
    output = output.replace(/\{user\.coins\}/gi, String(coins));
    output = output.replace(/\{user\.balance\}/gi, String(coins));

    // 6. Remplacement des variables serveur / salon
    const serverName = guild?.name || 'Serveur';
    const serverId = guild?.id || '0';
    const memberCount = guild?.memberCount || 0;
    const channelName = channel?.name || 'salon';
    const channelId = channel?.id || '0';
    const channelMention = `<#${channelId}>`;

    output = output.replace(/\{server\.name\}/gi, serverName);
    output = output.replace(/\{server\.id\}/gi, serverId);
    output = output.replace(/\{server\.member_count\}/gi, String(memberCount));
    output = output.replace(/\{server\.members\}/gi, String(memberCount));
    output = output.replace(/\{channel\.name\}/gi, channelName);
    output = output.replace(/\{channel\.id\}/gi, channelId);
    output = output.replace(/\{channel\.mention\}/gi, channelMention);

    return {
        text: output.trim(),
        actions
    };
}

module.exports = {
    parseCommandTags
};
