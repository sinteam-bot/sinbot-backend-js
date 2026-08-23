const { EmbedBuilder } = require('discord.js');
const {
  getCountdownState,
  updateCountdownState,
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

/**
 * Vérifie et initialise le salon CountDown au démarrage si aucun état n'existe
 */
async function checkAndInitCountDown(client) {
  const cdConfig = config.countdown || {};
  if (cdConfig.enabled === false) return;

  const COUNTDOWN_CHANNEL_ID = cdConfig.channel_id || '1533492760697503805';
  const COUNTDOWN_START_AT = cdConfig.start_number || 900;
  const messages = cdConfig.messages || {};

  try {
    let state = await getCountdownState(COUNTDOWN_CHANNEL_ID);
    if (!state) {
      const channel = await client.channels.fetch(COUNTDOWN_CHANNEL_ID).catch(() => null);
      if (channel) {
        state = await updateCountdownState(COUNTDOWN_CHANNEL_ID, COUNTDOWN_START_AT, 0, null, null);
        const text = formatMessage(
          messages.start_message || "**Allez la chienne commence :** {number}",
          { number: COUNTDOWN_START_AT }
        );
        await channel.send(text);
        console.log(`✅ CountDown initialisé: "${text}" envoyé dans le canal.`);
      }
    }
  } catch (error) {
    console.error('❌ Erreur checkAndInitCountDown:', error);
  }
}

module.exports = {
  name: 'messageCreate',
  checkAndInitCountDown,

  async execute(message) {
    const cdConfig = config.countdown || {};
    if (cdConfig.enabled === false) return;

    const COUNTDOWN_CHANNEL_ID = cdConfig.channel_id || '1533492760697503805';
    const COUNTDOWN_START_AT = cdConfig.start_number || 900;
    const trapChance = cdConfig.trap_chance !== undefined ? cdConfig.trap_chance : 0.15;
    const emojis = cdConfig.emojis || {};
    const EMOJI_OBSYBON_ID = emojis.obsybon_id || '1524104068514189422';
    const EMOJI_OBSYDEMON_ID = emojis.obsydemon_id || '1488145689916473544';
    const messages = cdConfig.messages || {};

    // Ne traiter que le salon CountDown et ignorer les bots
    if (message.channel.id !== COUNTDOWN_CHANNEL_ID || message.author.bot) {
      return;
    }

    try {
      // Récupérer l'état actuel depuis SQLite
      let state = await getCountdownState(COUNTDOWN_CHANNEL_ID);

      // Initialisation par défaut si la BDD est vide
      if (!state) {
        state = await updateCountdownState(COUNTDOWN_CHANNEL_ID, COUNTDOWN_START_AT, 0, null, null);
        const text = formatMessage(
          messages.start_message || "**Allez la chienne commence :** {number}",
          { number: COUNTDOWN_START_AT }
        );
        await message.channel.send(text);
        console.log('✅ CountDown initialisé à ' + COUNTDOWN_START_AT + ' en BDD.');
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
        console.log(`⚠️ [COUNTDOWN] ${message.author.tag} a essayé de poster deux fois d'affilée.`);
        return;
      }

      const contentText = message.content.trim();
      const isNumberFormat = /^\d+$/.test(contentText);
      const postedNumber = isNumberFormat ? parseInt(contentText, 10) : null;

      // ============================================
      // DÉTECTION & GESTION D'UN PIÈGE ACTIF
      // ============================================
      if (state.is_trap_active === 1) {
        const trapNum = state.trap_number;

        if (postedNumber !== null && postedNumber === trapNum) {
          // 🎉 L'utilisateur a ESQUIVÉ le piège ! (Il a bien répété le nombre du bot)
          try {
            const obsybonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYBON_ID) || EMOJI_OBSYBON_ID;
            await message.react(obsybonEmoji);
          } catch (e) {
            await message.react('✅').catch(() => { });
          }

          // Message du bot s'il a esquivé le piège
          const dodgeMsg = formatMessage(
            messages.trap_dodge_message || "**J’ai cru que j’allais vous avoir <:Obsydemoncouverture:{emojiObsydemon}>**",
            {
              userId: message.author.id,
              username: message.author.username,
              emojiObsydemon: EMOJI_OBSYDEMON_ID
            }
          );
          await message.channel.send(dodgeMsg);

          // Ajouter un point au joueur
          await addCountdownScore(COUNTDOWN_CHANNEL_ID, message.author.id, message.author.username);

          // Désactiver le piège et passer le nombre courant au trapNum avec l'id de l'utilisateur
          await updateCountdownState(COUNTDOWN_CHANNEL_ID, trapNum, 0, null, message.author.id);

          console.log(`🛡️ [COUNTDOWN] ${message.author.tag} a esquivé le piège (${trapNum}) !`);
          return;

        } else {
          // ❌ L'utilisateur est TOMBÉ dans le piège !
          try {
            const obsydemoEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYDEMON_ID) || EMOJI_OBSYDEMON_ID;
            await message.react(obsydemoEmoji);
          } catch (e) {
            await message.react('❌').catch(() => { });
          }

          const trapFailMsg = formatMessage(
            messages.trap_failed_message || "<@{userId}>**, Je t’ai eu ** <:Obsydemoncouverture:{emojiObsydemon}>",
            {
              userId: message.author.id,
              username: message.author.username,
              emojiObsydemon: EMOJI_OBSYDEMON_ID
            }
          );
          await message.channel.send(trapFailMsg);

          console.log(`🪤 [COUNTDOWN] ${message.author.tag} est tombé dans le piège (attendu: ${trapNum}, reçu: "${message.content}")`);
          return;
        }
      }

      // ============================================
      // DÉROULEMENT NORMAL (PAS DE PIÈGE ACTIF)
      // ============================================
      const currentNumber = state.current_number;
      const expectedNumber = currentNumber - 1;

      if (postedNumber !== null && postedNumber === expectedNumber) {
        // ✅ Nombre correct !
        try {
          const obsybonEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYBON_ID) || EMOJI_OBSYBON_ID;
          await message.react(obsybonEmoji);
        } catch (e) {
          await message.react('✅').catch(() => { });
        }

        // Incrémenter le score du joueur
        await addCountdownScore(COUNTDOWN_CHANNEL_ID, message.author.id, message.author.username);

        console.log(`🔢 [COUNTDOWN] ${message.author.tag} a validé le nombre ${expectedNumber}`);

        // ============================================
        // CAS PARTICULIER : ARRIVÉE À 0 !
        // ============================================
        if (expectedNumber === 0) {
          const finishMsg = formatMessage(
            messages.finish_message || "**Je suis émue, vous ne vous êtes pas trompés mais ce n’est pas fini <:Obsydemoncouverture:{emojiObsydemon}>**",
            {
              userId: message.author.id,
              username: message.author.username,
              emojiObsydemon: EMOJI_OBSYDEMON_ID
            }
          );
          await message.channel.send(finishMsg);

          // Récupérer le classement des joueurs
          const scores = await getCountdownScores(COUNTDOWN_CHANNEL_ID);

          let rankingText = messages.no_participation || "Aucune participation enregistrée.";
          if (scores.length > 0) {
            rankingText = scores.map((s, index) => {
              const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '👤'));
              return `${medal} **${s.username}** : ${s.score} point(s)`;
            }).join('\n');
          }

          const embed = new EmbedBuilder()
            .setColor(messages.embed_color || '#F2C7CE')
            .setTitle(messages.embed_title || '🏆 **Classement de la partie**')
            .setDescription(rankingText)
            .setTimestamp();

          await message.channel.send({ embeds: [embed] });

          // Réinitialiser les scores et réinitialiser le compte à rebours à COUNTDOWN_START_AT
          await resetCountdownScores(COUNTDOWN_CHANNEL_ID);
          await updateCountdownState(COUNTDOWN_CHANNEL_ID, COUNTDOWN_START_AT, 0, null, message.author.id);

          const restartMsg = formatMessage(
            messages.start_message || "**Allez la chienne commence :** {number}",
            { number: COUNTDOWN_START_AT }
          );
          await message.channel.send(restartMsg);
          return;
        }

        // ============================================
        // CHANCE D'ACTIVER UN PIÈGE ALÉATOIRE
        // ============================================
        const shouldTrap = (expectedNumber > 5 && expectedNumber < 85) && (Math.random() < trapChance);

        if (shouldTrap) {
          const trapNumber = expectedNumber - 1;
          console.log(`🪤 [COUNTDOWN] Piège déclenché par le bot ! Le bot poste ${trapNumber}`);

          // Le bot poste lui-même le nombre suivant
          await message.channel.send(`${trapNumber}`);

          // Enregistrer le piège actif en BDD
          await updateCountdownState(COUNTDOWN_CHANNEL_ID, trapNumber, 1, trapNumber, message.author.id);
        } else {
          // Mise à jour normale de l'état
          await updateCountdownState(COUNTDOWN_CHANNEL_ID, expectedNumber, 0, null, message.author.id);
        }

      } else {
        // ❌ Nombre INCORRECT !
        try {
          const obsydemoEmoji = message.guild?.emojis.cache.get(EMOJI_OBSYDEMON_ID) || EMOJI_OBSYDEMON_ID;
          await message.react(obsydemoEmoji);
        } catch (e) {
          await message.react('❌').catch(() => { });
        }

        const errorMsg = formatMessage(
          messages.error_message || "**Oups <@{userId}> s'est trompé(e), je vais devoir mordre ** <:Obsydemoncouverture:{emojiObsydemon}>",
          {
            userId: message.author.id,
            username: message.author.username,
            expectedNumber,
            postedNumber: message.content,
            emojiObsydemon: EMOJI_OBSYDEMON_ID
          }
        );

        await message.channel.send(errorMsg);
        console.log(`❌ [COUNTDOWN] ${message.author.tag} a fait une erreur (attendu: ${expectedNumber}, reçu: "${message.content}")`);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la gestion du CountDown:', error);
    }
  }
};
