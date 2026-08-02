const { getCounterState, updateCounterState } = require('../database');

const COUNTER_CHANNEL_ID = '1533492692825276598';
const EMOJI_OBSYBON_ID = '1524104068514189422';

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    // Ne traiter que les messages dans le salon "[🟢] nombres" et ignorer les bots
    if (message.channel.id !== COUNTER_CHANNEL_ID || message.author.bot) {
      return;
    }

    try {
      // Récupérer l'état actuel depuis la base de données
      let state = await getCounterState(COUNTER_CHANNEL_ID);

      // Si aucune donnée n'est en base, scanner les derniers messages pour s'auto-initialiser
      if (!state) {
        console.log('🔄 Initialisation automatique du compteur à partir de l\'historique du canal...');
        let lastValidNum = 0;
        let lastUserId = null;

        const fetchedMessages = await message.channel.messages.fetch({ limit: 30 });
        const sortedMessages = Array.from(fetchedMessages.values())
          .filter(m => m.id !== message.id && !m.author.bot) // ignorer le message actuel et les bots
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        for (const msg of sortedMessages) {
          const text = msg.content.trim();
          if (/^\d+$/.test(text)) {
            lastValidNum = parseInt(text, 10);
            lastUserId = msg.author.id;
          }
        }

        state = await updateCounterState(COUNTER_CHANNEL_ID, lastValidNum, lastUserId);
        console.log(`✅ Compteur initialisé au nombre: ${lastValidNum}`);
      }

      const currentNumber = state.current_number || 0;
      const expectedNumber = currentNumber + 1;

      const contentText = message.content.trim();
      const isNumberFormat = /^\d+$/.test(contentText);
      const postedNumber = isNumberFormat ? parseInt(contentText, 10) : null;

      // Vérification si le nombre posté est le bon nombre attendu
      if (postedNumber !== null && postedNumber === expectedNumber) {
        // ✅ Le nombre est correct !
        // Mettre à jour la BDD
        await updateCounterState(COUNTER_CHANNEL_ID, expectedNumber, message.author.id);

        // Ajouter la réaction :Obsybon: (ID: 1524104068514189422)
        try {
          const obsybonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYBON_ID) || EMOJI_OBSYBON_ID;
          await message.react(obsybonEmoji);
        } catch (reactError) {
          console.error('⚠️ Impossible d\'ajouter la réaction :Obsybon:', reactError.message);
          await message.react('✅').catch(() => { });
        }

        console.log(`🔢 [COUNTER] ${message.author.tag} a validé le nombre ${expectedNumber}`);

      } else {
        // ❌ Le nombre est INCORRECT !
        // Ajouter la réaction croix rouge
        await message.react('<:Obsydemoncouverture:1488145689916473544>').catch(() => { });

        // Message d'avertissement expliquant le nombre attendu
        const detail = postedNumber !== null
          ? `vous avez écrit **${postedNumber}**`
          : `"${message.content}" n'est pas un nombre valide`;

        await message.channel.send(
          `**Oups <@${message.author.id}> s\'est trompé(e), on va devoir sortir les crocs ! ** <:Obsydemoncouverture:1488145689916473544>` // 'Le nombre attendu était **${expectedNumber}** (${detail}).`
        );

        console.log(`❌ [COUNTER] ${message.author.tag} a fait une erreur (attendu: ${expectedNumber}, reçu: "${message.content}")`);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la vérification du compteur:', error);
    }
  }
};
