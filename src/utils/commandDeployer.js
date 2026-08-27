const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { getConfig, config } = require('../config/index.js');

/**
 * Synchronise l'ensemble des Slash Commands (legacy src/commands + modules src/modules) avec Discord.
 *
 * Utilise l'API REST Discord (Routes.applicationGuildCommands ou Routes.applicationCommands) via PUT.
 * Cette opération est idempotente : elle ajoute les nouvelles commandes, applique les modifications,
 * et supprime automatiquement toutes les commandes qui ne sont plus déclarées.
 *
 * @param {import('discord.js').Client} client
 * @param {Object} [options={}]
 * @param {string} [options.guildId] - ID du serveur cible (déploiement instantané)
 * @param {boolean} [options.global=false] - Déploiement global Discord
 * @returns {Promise<{ success: boolean, count: number, commands: string[], error?: string }>}
 */
async function syncDiscordSlashCommands(client, options = {}) {
    try {
        const currentConfig = (getConfig ? getConfig() : config) || {};
        const cmdConfig = currentConfig.discord?.commands || {};

        // 1. Vérifier si les commandes sont désactivées globalement
        if (cmdConfig.enabled === false) {
            console.log('ℹ️ [CommandDeployer] Commandes Discord désactivées dans la configuration. Synchronisation ignorée.');
            return { success: true, count: 0, commands: [], skipped: true };
        }

        // 2. Extraire le Token Discord
        const token = client?.token || process.env.DISCORD_TOKEN || currentConfig.discord?.token;
        if (!token) {
            console.warn('⚠️ [CommandDeployer] Aucun token Discord trouvé pour déployer les commandes.');
            return { success: false, error: 'Token Discord manquant' };
        }

        // 3. Extraire le Client ID (Application ID)
        const clientId = client?.user?.id || process.env.CLIENT_ID || currentConfig.discord?.client_id;
        if (!clientId) {
            console.warn('⚠️ [CommandDeployer] Aucun Client ID trouvé pour déployer les commandes.');
            return { success: false, error: 'Client ID manquant' };
        }

        // 4. Collecter toutes les Slash Commands enregistrées dans client.commands
        const slashCommandsPayload = [];
        const registeredNames = new Set();
        const commandDetails = [];

        if (client?.commands && client.commands.size > 0) {
            for (const [name, cmd] of client.commands.entries()) {
                // Obtenir les données JSON de la Slash Command
                let cmdData = null;
                if (cmd.data && typeof cmd.data.toJSON === 'function') {
                    cmdData = cmd.data.toJSON();
                } else if (cmd.data && typeof cmd.data === 'object' && cmd.data.name) {
                    cmdData = cmd.data;
                }

                if (cmdData && cmdData.name && !registeredNames.has(cmdData.name.toLowerCase())) {
                    // Vérifier que le nom respecte les règles Discord (1-32 caractères minuscules, chiffres, tirets)
                    const normalizedName = cmdData.name.toLowerCase();
                    if (/^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u.test(normalizedName)) {
                        registeredNames.add(normalizedName);
                        slashCommandsPayload.push(cmdData);
                        commandDetails.push({
                            name: normalizedName,
                            description: cmdData.description || 'Sans description',
                            module: cmd.module || 'Système'
                        });
                    }
                }
            }
        }

        if (slashCommandsPayload.length === 0) {
            console.warn('⚠️ [CommandDeployer] Aucune Slash Command valide trouvée à déployer.');
            return { success: true, count: 0, commands: [] };
        }

        console.log(`🚀 [CommandDeployer] Début de synchronisation de ${slashCommandsPayload.length} Slash Command(s) avec Discord...`);

        const rest = options.rest || new REST({ version: '10' }).setToken(token);

        // 5. Déterminer la guilde cible (serveur Discord) pour déploiement instantané
        const targetGuildId = options.guildId || process.env.GUILD_ID || currentConfig.discord?.guild_id || (client?.guilds?.cache?.first?.()?.id);

        let deployedGuildName = '';
        if (targetGuildId) {
            const guild = client?.guilds?.cache?.get?.(targetGuildId);
            deployedGuildName = guild ? `[${guild.name}] (ID: ${targetGuildId})` : `(Guild ID: ${targetGuildId})`;

            // Requête PUT sur les commandes de guilde :
            // -> Met à jour les commandes modifiées, ajoute les nouvelles et supprime automatiquement les obsolètes
            await rest.put(
                Routes.applicationGuildCommands(clientId, targetGuildId),
                { body: slashCommandsPayload }
            );

            console.log(`✨ [CommandDeployer] ${slashCommandsPayload.length} Slash Command(s) synchronisées avec succès sur le serveur ${deployedGuildName} !`);
        }

        // Si déploiement global expressément demandé ou si aucun guildId disponible
        if (options.global || !targetGuildId) {
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: slashCommandsPayload }
            );
            console.log(`✨ [CommandDeployer] ${slashCommandsPayload.length} Slash Command(s) synchronisées au niveau GLOBAL Discord.`);
        }

        // Afficher l'arbre récapitulatif des commandes synchronisées
        commandDetails.forEach((c, idx) => {
            const isLast = idx === commandDetails.length - 1;
            const prefix = isLast ? '   └─' : '   ├─';
            const modLabel = c.module ? ` [${c.module}]` : '';
            console.log(`${prefix} /${c.name}${modLabel} : ${c.description}`);
        });
        console.log('');

        return {
            success: true,
            count: slashCommandsPayload.length,
            commands: Array.from(registeredNames),
            targetGuildId
        };
    } catch (error) {
        console.error('❌ [CommandDeployer] Erreur lors de la synchronisation des Slash Commands:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    syncDiscordSlashCommands
};
