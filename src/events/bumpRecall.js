
module.exports = {
    name: 'messageCreate',

    async execute(message) {
        // Ignorer les messages du bot lui-même
        if (message.author.bot && message.author.id == '302050872383242240') { // Disboard Bot
            if (message.embeds.length === 0) return;
            const chaineRecherchee = "Bump effectué !"
            for (const embed of message.embeds) {
                if (embed.description && embed.description.includes(chaineRecherchee)) {

                    const guild = await message.guild;
                    //const channel = await guild.channels.fetch(CHANNEL_ID);

                    const date = new Date();
                    date.setHours(date.getHours() + 2);
                    const heureParis = date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
                    await console.log(`[BUMP] Bump effectué, Prochain Bump à : ${heureParis}`)
                    setTimeout(async () => {
                        await message.channel.send(`<@&1427703047534153872> **c'est l'heure de bumper Obsydian** <:Obsydemoncouverture:1488145689916473544>`); // 1488145689916473544
                        const heureParis = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
                        await console.log(`[BUMP] 2 heures se sont écoulées, le rappel a été envoyé à ${heureParis}!`)
                    }, 2 * 60 * 60 * 1000); // Deux heures
                }
            }
        }
    }
}