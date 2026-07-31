const path = require('path');

// ⭐ IMPORTANT : Remonter d'un niveau pour trouver .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
console.log('Test : '+CLIENT_ID);
const GUILD_ID = process.env.GUILD_ID; 
console.log('Test : '+GUILD_ID);

// Noms des commandes à supprimer
const COMMANDS_TO_DELETE = ["random","ask","chat","config"];

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function deleteCommands() {
  try {
    // Récupère toutes les commandes existantes
    // Pour les commandes globales :
    console.log('Test : '+GUILD_ID);
    const commands = await rest.get(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID));

    // Pour les commandes d'un serveur spécifique, remplace par :
    // const commands = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));

    console.log(`📋 ${commands.length} commande(s) trouvée(s) :`);
    commands.forEach((cmd) => console.log(`  - ${cmd.name} (${cmd.id})`));

    // Filtre les commandes à supprimer
    const toDelete = commands.filter((cmd) =>
      COMMANDS_TO_DELETE.includes(cmd.name)
    );

    if (toDelete.length === 0) {
      console.log("\n⚠️  Aucune commande correspondante trouvée.");
      return;
    }

    // Supprime chaque commande ciblée
    for (const cmd of toDelete) {
      await rest.delete(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID, cmd.id));
      // Pour un serveur spécifique :
      // await rest.delete(Routes.applicationGuildCommand(CLIENT_ID, GUILD_ID, cmd.id));
      console.log(`\n✅ Commande supprimée : "${cmd.name}" (${cmd.id})`);
    }

    console.log("\n🎉 Suppression terminée !");
  } catch (error) {
    console.error("❌ Erreur :", error);
  }
}

deleteCommands();