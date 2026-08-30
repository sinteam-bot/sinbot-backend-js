/**
 * challenges/index.js — Registre central des générateurs de challenges.
 *
 * Chaque challenge expose : { type, label, generate({ captchaConfig, userId, guildId }), verify(...) }
 *
 * Le helper `tts.js` permet d'ajouter une version audio WAV pour
 * l'accessibilité (cf. option `audio_accessibility` dans la config).
 */

const math = require('./math.js');
const image = require('./image.js');
const web = require('./web.js');
const { normalizeType } = require('./_types.js');

const REGISTRY = {
    math,
    image,
    web
};

/**
 * Renvoie le générateur pour un type donné (par défaut 'math').
 */
function getChallenge(type) {
    const normalized = normalizeType(type);
    return REGISTRY[normalized] || REGISTRY.math;
}

function listAvailable() {
    return Object.values(REGISTRY).map(c => ({ type: c.type, label: c.label }));
}

module.exports = {
    getChallenge,
    listAvailable,
    normalizeType
};