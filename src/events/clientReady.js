const { printStartupModulesTable } = require("../utils/modulesSummary.js");

module.exports = {
    name: 'clientReady',
    once: true,
    
    execute(client) {
        console.log('');
        console.log('╔══════════════════════════════════════╗');
        console.log('║   🤖 BOT DISCORD DÉMARRÉ !          ║');
        console.log('╚══════════════════════════════════════╝');
        console.log('');
        console.log(`✅ Connecté en tant que: ${client.user.tag}`);
        console.log(`📊 Serveurs: ${client.guilds.cache.size}`);
        console.log(`👥 Utilisateurs: ${client.users.cache.size}`);
        console.log('');

        // Afficher l'état de tous les modules
        printStartupModulesTable();
        
        // Définir le statut du bot
        client.user.setActivity('les commandes !help', { type: 'LISTENING' });

        // Synchronisation du cache BDD de toutes les données Discord
        const DiscordCacheService = require("../services/discordCacheService.js");
        const guildId = process.env.GUILD_ID;
        const guild = guildId ? client.guilds.cache.get(guildId) : client.guilds.cache.first();
        if (guild) {
            DiscordCacheService.syncAllDiscordCache(guild).catch(err => {
                console.error('❌ [Discord Cache] Erreur sync initiale:', err.message);
            });
        }
    }
};