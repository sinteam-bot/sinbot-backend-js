module.exports = {
    name: 'interactionCreate',
    
    async execute(interaction) {
        // Vérifier si c'est une commande slash
        if (!interaction.isChatInputCommand()) return;
        
        const command = interaction.client.commands.get(interaction.commandName);
        
        if (!command) {
            console.error(`❌ Commande ${interaction.commandName} introuvable.`);
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
