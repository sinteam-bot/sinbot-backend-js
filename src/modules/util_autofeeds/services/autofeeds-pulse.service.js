/**
 * src/modules/util_autofeeds/services/autofeeds-pulse.service.js
 *
 * Service "Community Pulse" gérant l'engagement automatique sous les messages Discord :
 * - Réactions emojis automatiques (ex: 🔥 Pépite, 😐 Bof, 💸 Déjà acheté)
 * - Sondages d'opinion automatiques (Discord Polls)
 */

class AutofeedsPulseService {
    /**
     * Applique la liste des réactions configurées sur un message Discord.
     * @param {Object} message Message Discord.js
     * @param {Array<string>} reactions Liste d'emojis ou noms d'emojis
     */
    async applyAutoReactions(message, reactions = []) {
        if (!message || typeof message.react !== 'function') return [];
        if (!Array.isArray(reactions) || reactions.length === 0) return [];

        const applied = [];
        for (const emoji of reactions) {
            try {
                if (emoji && typeof emoji === 'string') {
                    await message.react(emoji.trim());
                    applied.push(emoji.trim());
                }
            } catch (err) {
                // Ignore silencieusement les erreurs de permission ou d'emoji inconnu
            }
        }
        return applied;
    }

    async applyReactions(message, reactions = []) {
        return this.applyAutoReactions(message, reactions);
    }

    /**
     * Construit la configuration d'un sondage Discord natif si activé sur le flux.
     * @param {Object} feed
     * @param {Object} item
     * @returns {Object|null}
     */
    buildPollPayload(feed, item) {
        if (!feed || !feed.autoPoll) return null;
        let config = feed.autoPoll;
        if (typeof config === 'string') {
            try { config = JSON.parse(feed.autoPoll); } catch { config = true; }
        }

        if (config === true) {
            const questionText = `Que pensez-vous de : ${(item?.title || '').slice(0, 200)} ?`;
            return {
                question: { text: questionText },
                answers: [
                    { pollMedia: { text: '🔥 Directement !' } },
                    { pollMedia: { text: '⏳ Dans le backlog' } },
                    { pollMedia: { text: '❌ Pas mon style' } }
                ],
                duration: 24,
                allowMultiselect: false
            };
        }

        if (!config || !config.question) return null;

        const questionText = (config.question || '')
            .replace('{title}', item.title || '')
            .slice(0, 300);

        const answersList = Array.isArray(config.answers) && config.answers.length >= 2
            ? config.answers.slice(0, 10)
            : ['🔥 Directement !', '⏳ Dans le backlog', '❌ Pas mon style'];

        return {
            question: { text: questionText },
            answers: answersList.map(a => ({
                pollMedia: { text: String(a).slice(0, 55) }
            })),
            duration: Number(config.durationHours || 24),
            allowMultiselect: Boolean(config.allowMultiselect)
        };
    }

    /**
     * Envoie un sondage automatique dans le salon cible si supporté.
     * @param {Object} channel Salon Discord.js
     * @param {Object} pollPayload
     */
    async sendAutoPoll(channel, pollPayload) {
        if (!channel || typeof channel.send !== 'function' || !pollPayload) return null;
        try {
            return await channel.send({ poll: pollPayload });
        } catch {
            return null;
        }
    }
}

const autofeedsPulseService = new AutofeedsPulseService();

module.exports = {
    AutofeedsPulseService,
    autofeedsPulseService
};
