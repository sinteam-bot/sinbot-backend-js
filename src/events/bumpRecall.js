const { saveBump } = require('../database');

module.exports = {
    name: 'messageCreate',

    async execute(message) {
        // Détecter les messages du bot Disboard ('302050872383242240')
        if (message.author.bot && message.author.id === '302050872383242240') {
            if (!message.embeds || message.embeds.length === 0) return;

            const chaineRecherchee = "Bump effectué !";
            for (const embed of message.embeds) {
                const textToSearch = (embed.description || '') + ' ' + (embed.title || '');
                if (textToSearch.includes(chaineRecherchee)) {

                    // Extraction de l'utilisateur ayant exécuté la commande /bump
                    let bumperId = null;
                    let bumperUsername = null;
                    let bumperDate = message.createdAt;
                    console.log(`[BUMP]`, bumperDate);

                    // 1. Essayer via l'objet interaction (Discord.js v14)
                    if (message.interaction?.user) {
                        bumperId = message.interaction.user.id;
                        bumperUsername = message.interaction.user.username || message.interaction.user.globalName;
                    } else if (message.interactionMetadata?.user) {
                        bumperId = message.interactionMetadata.user.id;
                        bumperUsername = message.interactionMetadata.user.username || message.interactionMetadata.user.globalName;
                    }

                    // 2. Fallback: Chercher une mention d'utilisateur dans l'embed ou le message
                    if (!bumperId) {
                        const mentionMatch = textToSearch.match(/<@!?(\d+)>/);
                        if (mentionMatch) {
                            bumperId = mentionMatch[1];
                            const fetchedUser = message.client.users.cache.get(bumperId);
                            if (fetchedUser) bumperUsername = fetchedUser.username;
                        } else if (message.mentions?.users?.size > 0) {
                            const firstUser = message.mentions.users.first();
                            bumperId = firstUser.id;
                            bumperUsername = firstUser.username;
                        }
                    }

                    // Enregistrer le bump en BDD SQLite
                    const guildId = message.guild ? message.guild.id : 'unknown';
                    const channelId = message.channel.id;

                    await saveBump(guildId, channelId, bumperId, bumperUsername);

                    const heureParisRappel = new Date(Date.now() + (2 * 60 * 60 * 1000)).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
                    const userLabel = bumperUsername ? `@${bumperUsername}` : (bumperId ? `<@${bumperId}>` : 'Inconnu');
                    console.log(`[BUMP] Bump détecté par ${userLabel}. Sauvegardé en BDD. Rappel prévu pour : ${heureParisRappel}`);
                }
            }
        }
    }
};