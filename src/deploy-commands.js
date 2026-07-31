const path = require('path');

// ⭐ IMPORTANT : Remonter d'un niveau pour trouver .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');
const OpenAI = require('./utils/openai');
const fs = require('fs');



const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('📦 Chargement des commandes pour déploiement...\n');

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ ${command.data.name} - ${command.data.description}`);
    } else {
        console.warn(`⚠️  ${file} ne possède pas les propriétés 'data' et 'execute'`);
    }
}

console.log(`\n📊 Total : ${commands.length} commande(s) à déployer\n`);

// Construire l'instance REST
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Déployer les commandes
(async () => {
    try {
        console.log(`🚀 Déploiement de ${commands.length} commande(s) slash...`);

        // Pour un serveur spécifique (plus rapide, instantané)
        if (process.env.GUILD_ID) {
            const data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            console.log(`✅ ${data.length} commande(s) déployée(s) sur le serveur ${process.env.GUILD_ID} !`);
        } else {
            // Pour tous les serveurs (global, peut prendre jusqu'à 1h)
            const data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
            console.log(`✅ ${data.length} commande(s) déployée(s) globalement !`);
            console.log('⏰ Les commandes globales peuvent prendre jusqu\'à 1 heure pour apparaître.');
        }

        console.log('\n🎉 Déploiement terminé avec succès !');
    } catch (error) {
        console.error('❌ Erreur lors du déploiement:', error);
    }
})();