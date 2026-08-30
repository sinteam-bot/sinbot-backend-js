/**
 * src/modules/security_captcha/challenges/_types.js
 *
 * Types de challenges supportés par le module Captcha.
 * Chaque type expose : { id, label, generate(guildId, ctx), verify(answer, expected, ctx) }
 */

const TYPES = ['math', 'image', 'web', 'audio'];

/**
 * Vérifie qu'un type est supporté. Renvoie 'math' par défaut.
 */
function normalizeType(t) {
    return TYPES.includes(t) ? t : 'math';
}

module.exports = {
    TYPES,
    normalizeType
};