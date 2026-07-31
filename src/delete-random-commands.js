const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function deleteRandomCommands() {
  try {
    // Récupère toutes les commandes du serveur
    const commands = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));

    console.log(`📋 ${commands.length} commande(s) trouvée(s) :`);
    commands.forEach((cmd) => console.log(`  - ${cmd.name} (${cmd.id})`));

    // Trouve la commande random
    const randomCommand = commands.find(cmd => cmd.name === 'random');

    if (!randomCommand) {
      console.log("\n⚠️  La commande /random n'existe pas.");
      return;
    }

    // Supprime la commande random (et ses sous-commandes)
    await rest.delete(Routes.applicationGuildCommand(CLIENT_ID, GUILD_ID, randomCommand.id));
    console.log(`\n✅ Commande /random supprimée (ID: ${randomCommand.id})`);
    console.log("✅ Ses sous-commandes /random member et /random grognement sont également supprimées.");

    console.log("\n🎉 Suppression terminée !");
  } catch (error) {
    console.error("❌ Erreur :", error);
  }
}

deleteRandomCommands();