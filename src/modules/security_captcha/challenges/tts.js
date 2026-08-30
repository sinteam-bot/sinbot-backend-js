/**
 * challenges/tts.js — Helper TTS (Text-To-Speech) réutilisable.
 *
 * Génère un fichier WAV PCM 16-bit mono en pur JavaScript, sans
 * dépendance native. Le résultat est un son intelligible mais basique
 * (synthèse formantique) qui permet à un membre ayant des difficultés
 * de lecture d'écouter la question math en local.
 *
 * Utilisé comme accessibilité optionnelle pour les challenges 'math'
 * et 'image' via le flag `audio_accessibility` dans la config captcha.
 *
 * Note : ce n'est PAS un mode de captcha autonome. Le membre répond
 * toujours en tapant le chiffre dans le chat.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const TMP_DIR = path.resolve(__dirname, '../../../../data/captcha-tmp');

function ensureTmpDir() {
    if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
    }
}

const FRENCH_NUMBER_WORDS = {
    0: 'zéro', 1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq',
    6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix',
    11: 'onze', 12: 'douze', 13: 'treize', 14: 'quatorze', 15: 'quinze',
    16: 'seize', 17: 'dix-sept', 18: 'dix-huit', 19: 'dix-neuf', 20: 'vingt',
    30: 'trente', 40: 'quarante', 50: 'cinquante', 60: 'soixante',
    70: 'soixante-dix', 80: 'quatre-vingts', 90: 'quatre-vingt-dix',
    100: 'cent', 1000: 'mille'
};

function numberToFrench(n) {
    if (n in FRENCH_NUMBER_WORDS) return FRENCH_NUMBER_WORDS[n];
    if (n < 100) {
        const tens = Math.floor(n / 10) * 10;
        const units = n % 10;
        const base = FRENCH_NUMBER_WORDS[tens] || '';
        if (units === 0) return base;
        if (tens === 70 || tens === 90) {
            return (FRENCH_NUMBER_WORDS[60] || 'soixante') + '-' +
                   (FRENCH_NUMBER_WORDS[10 + units] || FRENCH_NUMBER_WORDS[units] || '');
        }
        return base + '-' + (FRENCH_NUMBER_WORDS[units] || '');
    }
    if (n < 1000) {
        const hundreds = Math.floor(n / 100);
        const rest = n % 100;
        const hundredsWord = (hundreds > 1 ? FRENCH_NUMBER_WORDS[hundreds] : '') +
                             ' cent' + (hundreds > 1 ? 's' : '');
        return rest === 0 ? hundredsWord : hundredsWord + ' ' + numberToFrench(rest);
    }
    if (n < 1000000) {
        const thousands = Math.floor(n / 1000);
        const rest = n % 1000;
        const thousandsWord = thousands === 1 ? 'mille' : numberToFrench(thousands) + ' mille';
        return rest === 0 ? thousandsWord : thousandsWord + ' ' + numberToFrench(rest);
    }
    return n.toString();
}

const FRENCH_OPERATORS = {
    '+': 'plus',
    '-': 'moins',
    '*': 'fois'
};

function toPhonetic(num1, num2, operator) {
    return [
        numberToFrench(num1),
        FRENCH_OPERATORS[operator] || operator,
        numberToFrench(num2)
    ].join(' ');
}

/**
 * Formants approximatifs (Hz) pour quelques voyelles/consonnes français.
 */
function _formantsForChar(c) {
    const vowels = {
        'a': { f1: 700, f2: 1100, f3: 2500, f1Amp: 0.5, f2Amp: 0.3, f3Amp: 0.15 },
        'e': { f1: 450, f2: 1900, f3: 2500, f1Amp: 0.4, f2Amp: 0.4, f3Amp: 0.15 },
        'i': { f1: 280, f2: 2250, f3: 2900, f1Amp: 0.3, f2Amp: 0.5, f3Amp: 0.2 },
        'o': { f1: 400, f2: 800, f3: 2400, f1Amp: 0.4, f2Amp: 0.3, f3Amp: 0.15 },
        'u': { f1: 320, f2: 850, f3: 2300, f1Amp: 0.35, f2Amp: 0.35, f3Amp: 0.15 },
        'y': { f1: 320, f2: 1700, f3: 2400, f1Amp: 0.35, f2Amp: 0.4, f3Amp: 0.15 }
    };
    if ('aeiouy'.includes(c)) return vowels[c] || vowels.a;
    return { f1: null, f2: null, f3: null };
}

function _isVoiced(c) {
    return 'aeiouybdgjlm nrvzw'.replace(/\s/g, '').includes(c);
}

/**
 * Synthèse WAV PCM 16-bit mono en pur JavaScript.
 */
function synthesizeWav(phonetic, options = {}) {
    const sampleRate = options.sampleRate || 22050;
    const baseFreq = options.baseFreq || 130;
    const durPerPhoneme = 110;
    const amplitude = 0.25;

    const phonemes = phonetic.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const samples = [];

    for (const ch of phonemes) {
        const durMs = /\s/.test(ch) ? 40 : durPerPhoneme;
        const n = Math.floor((durMs / 1000) * sampleRate);

        if (/\s|[?.,!]/.test(ch)) {
            for (let i = 0; i < n; i++) samples.push(0);
            continue;
        }

        const formants = _formantsForChar(ch);
        const isVoiced = _isVoiced(ch);

        for (let i = 0; i < n; i++) {
            const t = i / sampleRate;
            const attackSamples = Math.floor(0.01 * sampleRate);
            const releaseSamples = Math.floor(0.04 * sampleRate);
            let env;
            if (i < attackSamples) {
                env = i / attackSamples;
            } else if (i > n - releaseSamples) {
                env = Math.max(0, (n - i) / releaseSamples);
            } else {
                env = 1;
            }

            let sample = 0;
            if (isVoiced && formants.f1) {
                const fundamental = Math.sin(2 * Math.PI * baseFreq * t);
                const f1 = Math.sin(2 * Math.PI * formants.f1 * t) * formants.f1Amp;
                const f2 = Math.sin(2 * Math.PI * formants.f2 * t) * formants.f2Amp;
                const f3 = Math.sin(2 * Math.PI * formants.f3 * t) * formants.f3Amp;
                sample = (fundamental * 0.5 + f1 + f2 + f3) * env * amplitude;
            } else if (!isVoiced) {
                sample = (Math.random() * 2 - 1) * env * amplitude * 0.4;
            }

            samples.push(Math.max(-1, Math.min(1, sample)));
        }
    }

    return _encodeWavPcm16(samples, sampleRate);
}

function _encodeWavPcm16(samples, sampleRate) {
    const numSamples = samples.length;
    const byteRate = sampleRate * 2;
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
    }

    return buffer;
}

/**
 * Génère un fichier WAV d'accessibilité pour un challenge.
 * @param {object} params
 * @param {string} params.num1         nombre 1 (peut être string pour OCR)
 * @param {string|number} params.num2  nombre 2
 * @param {string} params.operator     opérateur ('+', '-', '*')
 * @param {string} [params.guildId]    pour traçabilité
 * @returns {{ wavBuffer: Buffer, filename: string, phonetic: string, filePath: string }}
 */
function generateTtsAttachment({ num1, num2, operator, guildId = 'unknown' }) {
    const n1 = typeof num1 === 'string' ? parseInt(num1, 10) : num1;
    const n2 = typeof num2 === 'string' ? parseInt(num2, 10) : num2;
    if (Number.isNaN(n1) || Number.isNaN(n2)) {
        throw new Error(`invalid_numbers: ${num1}, ${num2}`);
    }
    const phonetic = toPhonetic(n1, n2, operator);
    const wavBuffer = synthesizeWav(phonetic);

    ensureTmpDir();
    const token = crypto.randomBytes(8).toString('hex');
    const filePath = path.join(TMP_DIR, `tts-${guildId}-${token}.wav`);
    fs.writeFileSync(filePath, wavBuffer);

    return {
        wavBuffer,
        phonetic,
        filename: `captcha-tts-${token}.wav`,
        filePath
    };
}

/**
 * Nettoie les fichiers TTS expirés.
 */
function cleanupOldTts(maxAgeMs = 5 * 60 * 1000) {
    if (!fs.existsSync(TMP_DIR)) return 0;
    const now = Date.now();
    let removed = 0;
    for (const file of fs.readdirSync(TMP_DIR)) {
        if (!file.startsWith('tts-') || !file.endsWith('.wav')) continue;
        const full = path.join(TMP_DIR, file);
        try {
            const stat = fs.statSync(full);
            if (now - stat.mtimeMs > maxAgeMs) {
                fs.unlinkSync(full);
                removed++;
            }
        } catch {}
    }
    return removed;
}

module.exports = {
    generateTtsAttachment,
    cleanupOldTts,
    toPhonetic,
    numberToFrench,
    synthesizeWav,
    TMP_DIR
};