const { checkCommandPermissions } = require("../utils/commandHandler.js");

module.exports = {
    name: 'interactionCreate',
    
    async execute(interaction) {
        // Les boutons des modules sont traités via l'EventBus modulaire (DailyMessageEvent, etc.)
        if (interaction.isButton()) {
            return;
        }

        // Gestion des commandes slash
        if (!interaction.isChatInputCommand()) return;
        
        const command = interaction.client.commands.get(interaction.commandName);
        
        if (!command) {
            console.error(`❌ Commande ${interaction.commandName} introuvable.`);
            return;
        }
        
        // Vérification de la configuration des permissions pour cette commande
        const permCheck = checkCommandPermissions(interaction, interaction.commandName);
        if (!permCheck.allowed) {
            await interaction.reply({
                content: permCheck.reason || '⛔ Vous n\'avez pas la permission d\'exécuter cette commande.',
                ephemeral: true
            });
            return;
        }

        // Vérifier si la commande a une méthode executeSlash
        if (!command.executeSlash) {
            await interaction.reply({
                content: '❌ Cette commande n\'est pas encore disponible en Slash Command.',
                ephemeral: true
            });
            return;
        }
        
        try {
            console.log(`🎯 Exécution de /${interaction.commandName} par ${interaction.user.username}`);
            await command.executeSlash(interaction);
        } catch (error) {
            console.error(`❌ Erreur lors de l'exécution de /${interaction.commandName}:`, error);
            
            const errorMessage = {
                content: '❌ Une erreur est survenue lors de l\'exécution de cette commande.',
                ephemeral: true
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};
