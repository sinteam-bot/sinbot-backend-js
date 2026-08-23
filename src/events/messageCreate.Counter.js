const { EmbedBuilder } = require('discord.js');
const {
  getCounterState,
  updateCounterState,
  addCountdownScore,
  getCountdownScores,
  resetCountdownScores
} = require("../database.js");
const { config } = require("../config/index.js");

function formatMessage(template, replacements = {}) {
  if (!template) return '';
  let res = template;
  for (const [key, val] of Object.entries(replacements)) {
    res = res.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return res;
}

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    const counterConfig = config.counter || {};
    if (counterConfig.enabled === false) return;

    const COUNTER_CHANNEL_ID = counterConfig.channel_id || '1533492692825276598';
    const emojis = counterConfig.emojis || {};
    const EMOJI_OBSYBON_ID = emojis.obsybon_id || '1524104068514189422';
    const EMOJI_OBSYDEMON_ID = emojis.obsydemon_id || '1488145689916473544';
    const messages = counterConfig.messages || {};

    // Ne traiter que les messages dans le salon de compteur et ignorer les bots
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

      // ============================================
      // VÉRIFICATION : PAS DEUX NOMBRES À LA SUITE
      // ============================================
      if (state.last_user_id === message.author.id) {
        try {
          const obsyDemonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYDEMON_ID) || EMOJI_OBSYDEMON_ID;
          await message.react(obsyDemonEmoji);
        } catch (e) {
          await message.react('❌').catch(() => { });
        }

        const doublePostMsg = formatMessage(
          messages.double_post_message || "<@{userId}>, **vous ne pouvez pas partager deux nombres à la suite** <:Obsydemoncouverture:{emojiObsydemon}>",
          {
            userId: message.author.id,
            username: message.author.username,
            emojiObsydemon: EMOJI_OBSYDEMON_ID
          }
        );

        await message.channel.send(doublePostMsg);
        console.log(`⚠️ [COUNTER] ${message.author.tag} a essayé de poster deux fois d'affilée.`);
        return;
      }

      const currentNumber = state.current_number || 0;
      const expectedNumber = currentNumber + 1;

      const contentText = message.content.trim();
      const isNumberFormat = /^\d+$/.test(contentText);
      const postedNumber = isNumberFormat ? parseInt(contentText, 10) : null;

      // Vérification si le nombre posté est le bon nombre attendu
      if (postedNumber !== null && postedNumber === expectedNumber) {
        // ✅ Le nombre est correct !
        await updateCounterState(COUNTER_CHANNEL_ID, expectedNumber, message.author.id);

        // Ajouter un point au joueur
        await addCountdownScore(COUNTER_CHANNEL_ID, message.author.id, message.author.username);

        // Ajouter la réaction :Obsybon:
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
        try {
          const obsyDemonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYDEMON_ID) || EMOJI_OBSYDEMON_ID;
          await message.react(obsyDemonEmoji);
        } catch (e) {
          await message.react('❌').catch(() => { });
        }

        // Récupérer et afficher le classement de la session
        const scores = await getCountdownScores(COUNTER_CHANNEL_ID);

        let rankingText = messages.no_participation || "Aucune participation enregistrée pour cette session.";
        if (scores.length > 0) {
          rankingText = scores.map((s, index) => {
            const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '👤'));
            return `${medal} **${s.username}** : ${s.score} point(s)`;
          }).join('\n');
        }

        const rankingTextHeader = formatMessage(
          messages.ranking_header || "**<@{userId}> a ruiné la Route de l'Infini en envoyant un nombre incorrect !** \n\n 🏆 **Classement de la Route de l'Infini**\n",
          {
            userId: message.author.id,
            username: message.author.username,
            expectedNumber,
            postedNumber: message.content
          }
        );

        const rankingTextFooter = messages.ranking_footer || "\n\nLe compteur a été réinitialisé, le prochain nombre est 1.";

        const embed = new EmbedBuilder()
          .setColor(messages.embed_color || '#F2C7CE')
          .setTitle(messages.embed_title || '❌ Perdu !')
          .setDescription(rankingTextHeader + rankingText + rankingTextFooter)
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });

        // Réinitialiser les scores et le compteur à 0 (le prochain sera 1)
        await resetCountdownScores(COUNTER_CHANNEL_ID);
        await updateCounterState(COUNTER_CHANNEL_ID, 0, null);

        console.log(`❌ [COUNTER] ${message.author.tag} a fait une erreur (attendu: ${expectedNumber}, reçu: "${message.content}"). Classement affiché et réinitialisé.`);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la vérification du compteur:', error);
    }
  }
};
