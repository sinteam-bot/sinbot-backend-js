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

/**
 * Exécuter une commande préfixe (!)
 */
async function executeCommand(commandName, message, args, commands) {
    const command = commands.get(commandName.toLowerCase());
    
    if (!command) {
        return false;
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
    executeCommand
};