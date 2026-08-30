/**
 * src/modules/util_fun/services/fun.service.js
 *
 * Logique métier pour les commandes Fun et transformations de texte (Phase 9 G04, G27).
 */

const { Injectable } = require('../../../core/index.js');

const EIGHT_BALL_ANSWERS = [
    // Positives
    'Essaye encore', 'C’est certain', 'Sans aucun doute', 'Oui absolument',
    'Tu peux compter dessus', 'Très probable', 'Oui', 'C’est bien parti',
    // Neutres
    'Réponse floue, réessaie', 'Repose ta question plus tard', 'Mieux vaut ne pas te le dire maintenant',
    'Impossible de prédire maintenant', 'Concentre-toi et redemande',
    // Négatives
    'Ne compte pas dessus', 'Ma réponse est non', 'Mes sources disent non',
    'Perspectives pas très bonnes', 'Très peu probable'
];

const POPULAR_MEMES = [
    { title: 'Distracted Boyfriend', url: 'https://i.imgflip.com/1ur9b0.jpg' },
    { title: 'Drake Hotline Bling', url: 'https://i.imgflip.com/30b1gx.jpg' },
    { title: 'Two Buttons', url: 'https://i.imgflip.com/1g8my4.jpg' },
    { title: 'Left Exit 12 Off Ramp', url: 'https://i.imgflip.com/22bdq6.jpg' },
    { title: 'Change My Mind', url: 'https://i.imgflip.com/24y43o.jpg' },
    { title: 'Epic Handshake', url: 'https://i.imgflip.com/28j0te.jpg' },
    { title: 'Always Has Been', url: 'https://i.imgflip.com/46e43q.png' },
    { title: 'Buff Doge vs. Cheems', url: 'https://i.imgflip.com/43a45p.png' }
];

const ZALGO_CHARS = [
    '\u0300', '\u0301', '\u0302', '\u0303', '\u0304', '\u0305', '\u0306', '\u0307',
    '\u0308', '\u0309', '\u030A', '\u030B', '\u030C', '\u030D', '\u030E', '\u030F',
    '\u0310', '\u0311', '\u0312', '\u0313', '\u0314', '\u0315', '\u0316', '\u0317'
];

class FunService {
    eightBall(question) {
        if (!question || typeof question !== 'string') {
            return { answer: 'Pose-moi une vraie question !' };
        }
        const index = Math.floor(Math.random() * EIGHT_BALL_ANSWERS.length);
        return {
            question,
            answer: EIGHT_BALL_ANSWERS[index]
        };
    }

    rollDice(expression = '1d6') {
        const str = String(expression || '1d6').trim().toLowerCase();
        
        let count = 1;
        let sides = 6;

        if (/^\d+$/.test(str)) {
            sides = parseInt(str, 10);
        } else if (/^(\d+)d(\d+)$/.test(str)) {
            const match = str.match(/^(\d+)d(\d+)$/);
            count = parseInt(match[1], 10);
            sides = parseInt(match[2], 10);
        } else if (/^d(\d+)$/.test(str)) {
            const match = str.match(/^d(\d+)$/);
            sides = parseInt(match[1], 10);
        }

        count = Math.max(1, Math.min(count, 100));
        sides = Math.max(2, Math.min(sides, 10000));

        const rolls = [];
        let total = 0;

        for (let i = 0; i < count; i++) {
            const roll = Math.floor(Math.random() * sides) + 1;
            rolls.push(roll);
            total += roll;
        }

        return {
            expression: `${count}d${sides}`,
            count,
            sides,
            rolls,
            total
        };
    }

    flipCoin() {
        const isHeads = Math.random() < 0.5;
        return {
            result: isHeads ? 'Pile' : 'Face',
            side: isHeads ? 'heads' : 'tails',
            emoji: isHeads ? '🪙' : '🪙'
        };
    }

    getRandomMeme() {
        const index = Math.floor(Math.random() * POPULAR_MEMES.length);
        return POPULAR_MEMES[index];
    }

    mockText(text = '') {
        return String(text)
            .split('')
            .map((char, i) => i % 2 === 0 ? char.toLowerCase() : char.toUpperCase())
            .join('');
    }

    reverseText(text = '') {
        return String(text).split('').reverse().join('');
    }

    uppercaseText(text = '') {
        return String(text).toUpperCase();
    }

    zalgoText(text = '', intensity = 3) {
        const count = Math.max(1, Math.min(intensity, 10));
        let output = '';
        for (const char of String(text)) {
            output += char;
            if (/[a-zA-Z0-9]/.test(char)) {
                for (let i = 0; i < count; i++) {
                    const z = ZALGO_CHARS[Math.floor(Math.random() * ZALGO_CHARS.length)];
                    output += z;
                }
            }
        }
        return output;
    }
}

Injectable()(FunService);

module.exports = { FunService };
