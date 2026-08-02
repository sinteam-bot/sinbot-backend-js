const { EmbedBuilder } = require('discord.js');
const {
  getCountdownState,
  updateCountdownState,
  addCountdownScore,
  getCountdownScores,
  resetCountdownScores
} = require('../database');

const COUNTDOWN_CHANNEL_ID = '1533492760697503805';
const EMOJI_OBSYBON_ID = '1524104068514189422';
const EMOJI_OBSYDEMON_ID = '1488145689916473544';

/**
 * Vérifie et initialise le salon CountDown au démarrage si aucun état n'existe
 */
async function checkAndInitCountDown(client) {
  try {
    let state = await getCountdownState(COUNTDOWN_CHANNEL_ID);
    if (!state) {
      const channel = await client.channels.fetch(COUNTDOWN_CHANNEL_ID).catch(() => null);
      if (channel) {
        state = await updateCountdownState(COUNTDOWN_CHANNEL_ID, 90, 0, null, null);
        await channel.send("Allez je commence : 90");
        console.log('✅ CountDown initialisé : "Allez je commence : 90" envoyé dans le canal.');
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
    // Ne traiter que le salon CountDown et ignorer les bots
    if (message.channel.id !== COUNTDOWN_CHANNEL_ID || message.author.bot) {
      return;
    }

    try {
      // Récupérer l'état actuel depuis SQLite
      let state = await getCountdownState(COUNTDOWN_CHANNEL_ID);

      // Initialisation par défaut si la BDD est vide
      if (!state) {
        state = await updateCountdownState(COUNTDOWN_CHANNEL_ID, 90, 0, null, null);
        await message.channel.send("Allez je commence : 90");
        console.log('✅ CountDown initialisé à 90 en BDD.');
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
          await message.channel.send(`**J’ai cru que j’allais vous avoir <:Obsydemoncouverture:${EMOJI_OBSYDEMON_ID}>**`);

          // Ajouter un point au joueur
          await addCountdownScore(COUNTDOWN_CHANNEL_ID, message.author.id, message.author.username);

          // Désactiver le piège et passer le nombre courant au trapNum
          await updateCountdownState(COUNTDOWN_CHANNEL_ID, trapNum, 0, null, message.author.id);

          console.log(`🛡️ [COUNTDOWN] ${message.author.tag} a esquivé le piège (${trapNum}) !`);
          return;

        } else {
          // ❌ L'utilisateur est TOMBÉ dans le piège ! (Il a posté trapNum - 1 ou un autre nombre)
          await message.react('❌').catch(() => { });

          await message.channel.send(
            `❌ Oups... <@${message.author.id}>, Tu es tombé dans mon piège ! Le nombre qu'il fallait poster était **${trapNum}**.`
          );

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
          await message.channel.send("**Je suis émue, vous ne vous êtes pas trompés mais ce n’est pas fini !**");

          // Récupérer le classement des joueurs
          const scores = await getCountdownScores(COUNTDOWN_CHANNEL_ID);

          let rankingText = "Aucune participation enregistrée.";
          if (scores.length > 0) {
            rankingText = scores.map((s, index) => {
              const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '👤'));
              return `${medal} **${s.username}** : ${s.score} point(s)`;
            }).join('\n');
          }

          const embed = new EmbedBuilder()
            .setColor('#F2C7CE')
            .setTitle('🏆 **Classement de la partie**')
            .setDescription(rankingText)
            .setTimestamp();

          await message.channel.send({ embeds: [embed] });

          // Réinitialiser les scores et réinitialiser le compte à rebours à 90
          await resetCountdownScores(COUNTDOWN_CHANNEL_ID);
          await updateCountdownState(COUNTDOWN_CHANNEL_ID, 90, 0, null, message.author.id);

          await message.channel.send("Allez je commence : 90");
          return;
        }

        // ============================================
        // CHANCE D'ACTIVER UN PIÈGE ALÉATOIRE (~15% de chance)
        // ============================================
        const shouldTrap = (expectedNumber > 5 && expectedNumber < 85) && (Math.random() < 0.15);

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
        await message.react('❌').catch(() => { });

        const detail = postedNumber !== null
          ? `vous avez écrit **${postedNumber}**`
          : `"${message.content}" n'est pas un nombre valide`;

        await message.channel.send(
          `**Oups <@${message.author.id}> s\'est trompé(e), on va devoir sortir les crocs ! ** <:Obsydemoncouverture:${EMOJI_OBSYDEMON_ID}>`
        );

        console.log(`❌ [COUNTDOWN] ${message.author.tag} a fait une erreur (attendu: ${expectedNumber}, reçu: "${message.content}")`);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la gestion du CountDown:', error);
    }
  }
};
