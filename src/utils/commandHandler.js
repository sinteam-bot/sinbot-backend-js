const fs = require('fs');
const path = require('path');

/**
 * Charger toutes les commandes depuis le dossier commands
 * Compatible avec les commandes préfixe ET les Slash Commands
 */
function loadCommands(client) {
    const commands = new Map();
    const commandsPath = path.join(__dirname, '../commands');
    
    // Vérifier si le dossier existe
    if (!fs.existsSync(commandsPath)) {
        console.error('❌ Le dossier commands n\'existe pas');
        return commands;
    }
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    console.log('📂 Chargement des commandes...');
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        // Déterminer le nom de la commande
        let commandName = null;
        let commandType = '';
        
        // Si c'est une Slash Command (nouveau format)
        if ('data' in command && command.data && command.data.name) {
            commandName = command.data.name;
            commands.set(commandName, command);
            
            // Déterminer le type
            if (command.execute && command.executeSlash) {
                commandType = 'Hybride (! et /)';
            } else if (command.executeSlash && !command.execute) {
                commandType = 'Slash uniquement (/)';
            } else if (command.execute && !command.executeSlash) {
                commandType = 'Préfixe uniquement (!)';
            } else {
                commandType = 'Slash Command';
            }
            
            console.log(`✅ ${commandName} - ${commandType}`);
        }
        // Si c'est une commande préfixe (ancien format)
        else if ('name' in command) {
            commandName = command.name;
            commands.set(commandName, command);
            commandType = 'Préfixe uniquement (!)';
            console.log(`✅ ${commandName} - ${commandType}`);
        }
        else {
            console.warn(`⚠️  La commande ${file} n'a ni 'data.name' ni 'name'`);
            continue;
        }
        
        // Ajouter les alias si présents
        if (command.aliases && Array.isArray(command.aliases)) {
            command.aliases.forEach(alias => {
                commands.set(alias, command);
            });
            console.log(`   └─ Alias: ${command.aliases.join(', ')}`);
        }
    }
    
    console.log(`📦 ${commands.size} commande(s) chargée(s)\n`);
    return commands;
}

const { PermissionsBitField } = require('discord.js');
const { getConfig } = require('../config/index.js');

/**
 * Vérifie si un utilisateur ou salon a la permission d'exécuter une commande Discord
 * @param {import('discord.js').ChatInputCommandInteraction | import('discord.js').Message} context
 * @param {string} commandName
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkCommandPermissions(context, commandName) {
    const config = getConfig();
    const cmdConfig = config.discord?.commands || {};

    // 1. Vérifier si les commandes sont globalement activées
    if (cmdConfig.enabled === false) {
        return { allowed: false, reason: '❌ Les commandes du bot sont temporairement désactivées.' };
    }

    const member = context.member;
    const user = context.user || context.author;
    const channelId = context.channelId || context.channel?.id;
    const userId = user?.id;

    // Administrateurs Discord toujours autorisés par défaut
    const isAdmin = member?.permissions?.has?.(PermissionsBitField.Flags.Administrator);
    if (isAdmin) {
        return { allowed: true };
    }

    // 2. Vérification des utilisateurs autorisés globaux (si liste définie)
    if (Array.isArray(cmdConfig.allowed_users) && cmdConfig.allowed_users.length > 0) {
        if (!cmdConfig.allowed_users.includes(userId)) {
            return { allowed: false, reason: '⛔ Vous n\'êtes pas autorisé à exécuter des commandes sur ce serveur.' };
        }
    }

    // 3. Vérification des rôles autorisés globaux (si liste définie)
    if (Array.isArray(cmdConfig.allowed_roles) && cmdConfig.allowed_roles.length > 0) {
        const hasAllowedRole = member?.roles?.cache ? cmdConfig.allowed_roles.some(roleId => member.roles.cache.has(roleId)) : false;
        if (!hasAllowedRole) {
            return { allowed: false, reason: '⛔ Vous ne possédez pas le rôle requis pour exécuter cette commande.' };
        }
    }

    // 4. Vérification des salons autorisés globaux (si liste définie)
    if (Array.isArray(cmdConfig.allowed_channels) && cmdConfig.allowed_channels.length > 0) {
        if (!cmdConfig.allowed_channels.includes(channelId)) {
            return { allowed: false, reason: `⛔ Les commandes ne sont pas autorisées dans ce salon. Salons autorisés : ${cmdConfig.allowed_channels.map(id => `<#${id}>`).join(', ')}` };
        }
    }

    // 5. Vérification des permissions spécifiques par commande
    const specificPerms = cmdConfig.permissions?.[commandName];
    if (specificPerms) {
        if (specificPerms.admin_only && !isAdmin) {
            return { allowed: false, reason: '⛔ Cette commande est réservée aux administrateurs du serveur.' };
        }
        if (Array.isArray(specificPerms.allowed_users) && specificPerms.allowed_users.length > 0) {
            if (!specificPerms.allowed_users.includes(userId)) {
                return { allowed: false, reason: '⛔ Vous n\'êtes pas autorisé à utiliser cette commande.' };
            }
        }
        if (Array.isArray(specificPerms.allowed_roles) && specificPerms.allowed_roles.length > 0) {
            const hasRole = member?.roles?.cache ? specificPerms.allowed_roles.some(roleId => member.roles.cache.has(roleId)) : false;
            if (!hasRole) {
                return { allowed: false, reason: '⛔ Vous ne possédez pas le rôle requis pour utiliser cette commande.' };
            }
        }
        if (Array.isArray(specificPerms.allowed_channels) && specificPerms.allowed_channels.length > 0) {
            if (!specificPerms.allowed_channels.includes(channelId)) {
                return { allowed: false, reason: `⛔ Cette commande doit être exécutée dans : ${specificPerms.allowed_channels.map(id => `<#${id}>`).join(', ')}` };
            }
        }
    }

    return { allowed: true };
}

/**
 * Exécuter une commande préfixe (!)
 */
async function executeCommand(commandName, message, args, commands) {
    const command = commands.get(commandName.toLowerCase());
    
    if (!command) {
        return false;
    }
    
    // Vérification des permissions
    const permCheck = checkCommandPermissions(message, commandName);
    if (!permCheck.allowed) {
        message.reply(permCheck.reason || '⛔ Vous n\'avez pas la permission d\'exécuter cette commande.');
        return true;
    }

    // Vérifier si la commande a une méthode execute pour les commandes préfixe
    if (!command.execute) {
        message.reply('❌ Cette commande est uniquement disponible en Slash Command. Utilisez `/` au lieu de `!`');
        return true;
    }
    
    try {
        await command.execute(message, args);
        return true;
    } catch (error) {
        console.error(`❌ Erreur lors de l'exécution de la commande ${commandName}:`, error);
        message.reply('❌ Une erreur est survenue lors de l\'exécution de cette commande.');
        return true;
    }
}

module.exports = {
    loadCommands,
    executeCommand,
    checkCommandPermissions
};