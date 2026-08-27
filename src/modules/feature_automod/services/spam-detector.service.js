/**
 * SpamDetector — détecte le spam de messages et de mentions
 *
 * Utilise un sliding window en mémoire (Map par guildId+userId).
 * Purge automatique des entrées expirées à chaque appel (cheap).
 *
 * Pas d'état partagé entre guilds (clé composite 'guildId:userId').
 */

class SpamDetector {
    constructor() {
        this.messageHistory = new Map(); // key -> [timestamps ms]
        this.mentionHistory = new Map();
    }

    _key(guildId, userId) {
        return `${guildId}:${userId}`;
    }

    _pushAndPrune(history, key, timestamp, windowMs, maxSize = 50) {
        let arr = history.get(key);
        if (!arr) {
            arr = [];
            history.set(key, arr);
        }
        arr.push(timestamp);
        const cutoff = timestamp - windowMs;
        while (arr.length > 0 && arr[0] < cutoff) {
            arr.shift();
        }
        if (arr.length > maxSize) {
            arr.splice(0, arr.length - maxSize);
        }
        return arr;
    }

    /**
     * Vérifie si un message constitue du spam selon la config
     * @param {string} guildId
     * @param {string} userId
     * @param {{ content?: string, mentions?: { users?: { size: number } } }} message
     * @param {{ max_messages: number, window_seconds: number, max_mentions: number, mentions_window_seconds: number }} config
     * @returns {{ spam: boolean, reason?: string, count?: number }}
     */
    checkMessage(guildId, userId, message, config) {
        const ts = Date.now();
        const key = this._key(guildId, userId);
        const messages = this._pushAndPrune(this.messageHistory, key, ts, config.window_seconds * 1000);
        if (messages.length >= config.max_messages) {
            return { spam: true, reason: 'rate', count: messages.length };
        }

        if (message.mentions && message.mentions.users) {
            const mentionCount = message.mentions.users.size;
            if (mentionCount > 0) {
                const mentions = this._pushAndPrune(
                    this.mentionHistory, key, ts, config.mentions_window_seconds * 1000
                );
                const totalMentions = mentions.reduce((sum) => sum + 1, 0) + (mentionCount - 1);
                if (totalMentions >= config.max_mentions) {
                    return { spam: true, reason: 'mentions', count: totalMentions };
                }
            }
        }

        return { spam: false };
    }

    /**
     * Nettoie complètement l'historique (utile pour les tests)
     */
    reset() {
        this.messageHistory.clear();
        this.mentionHistory.clear();
    }
}

module.exports = { SpamDetector };
