const { setupScheduledTasks } = require('../utils/scheduledTasks');
const { checkAndInitCountDown } = require('./messageCreate.CountDown');

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
        
        // Définir le statut du bot
        client.user.setActivity('les commandes !help', { type: 'LISTENING' });
        
        // Démarrer les tâches planifiées
        setupScheduledTasks(client);

        // Initialiser le salon CountDown si necessaire
        checkAndInitCountDown(client);
    }
};