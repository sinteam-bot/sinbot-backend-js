const { logUserEvent, addMessageXP } = require("../database.js");
const { executeCommand } = require("../utils/commandHandler.js");
const { config } = require("../config/index.js");

module.exports = {
    name: 'messageCreate',

    async execute(message) {
        // Ignorer les messages du bot lui-même
        if (message.author.bot) return;

        // 1. Vérifier si c'est une commande préfixe (!)
        if (message.content.startsWith('!')) {
            const args = message.content.slice(1).trim().split(/ +/);
            const commandName = args.shift()?.toLowerCase();
            if (commandName && message.client.commands) {
                const handled = await executeCommand(commandName, message, args, message.client.commands);
                if (handled) return;
            }
        }

        // 2. Vérifier si c'est un canal captcha pour ne pas logger l'XP ni l'activité standard
        const isCaptchaChannel = message.channel.name?.includes('verification') ||
            message.channel.name?.includes('captcha') ||
            message.channel.topic?.includes('vérification') ||
            message.channel.topic?.includes('captcha');

        if (isCaptchaChannel) {
            return;
        }

        // 3. Traitement normal (log d'activité & gain d'XP)
        await logUserEvent(
            message.author.id,
            message.author.username,
            'message',
            {
                channelId: message.channelId,
                channelName: message.channel.name,
                contentLength: message.content.length,
                guildId: message.guildId,
                guildName: message.guild?.name
            }
        );

        // Ajouter de l'XP pour le message (si le module XP est activé)
        await addMessageXP(message.author.id, message.author.username);
    }
};
