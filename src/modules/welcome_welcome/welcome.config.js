/**
 * welcome.config.js — Helper de lecture de la config welcome par-guilde.
 *
 * Lit la config depuis data/{guildId}/welcome.config.yml via c12-loader.
 * Pour les écritures (setters), persiste via setFeatureConfig (par-guilde).
 */

const path = require('path');
const fs = require('fs');

const { getFeatureConfig, setFeatureConfig } = require('../../config/c12-loader.js');

/**
 * Charge la config welcome d'une guilde.
 * @param {string} guildId
 * @returns {Promise<object>}
 */
async function getWelcomeConfig(guildId) {
    if (!guildId) return {};
    try {
        const cfg = await getFeatureConfig(guildId, 'welcome');
        return cfg || {};
    } catch (e) {
        console.warn(`[welcome.config] getWelcomeConfig(${guildId}):`, e.message);
        return {};
    }
}

/**
 * Sauvegarde (patch) la config welcome d'une guilde.
 * @param {string} guildId
 * @param {object} patch
 */
async function saveWelcomeConfig(guildId, patch) {
    if (!guildId) return null;
    try {
        return await setFeatureConfig(guildId, 'welcome', patch || {});
    } catch (e) {
        console.warn(`[welcome.config] saveWelcomeConfig(${guildId}):`, e.message);
        return null;
    }
}

/**
 * Lit la valeur d'un champ de la config welcome pour une guilde.
 * Helper simple pour le service (les setters passent par saveWelcomeConfig).
 * @param {string} guildId
 * @param {string} key
 * @param {*} fallback
 */
async function getWelcomeField(guildId, key, fallback) {
    const cfg = await getWelcomeConfig(guildId);
    if (cfg && Object.prototype.hasOwnProperty.call(cfg, key)) return cfg[key];
    return fallback;
}

module.exports = {
    getWelcomeConfig,
    saveWelcomeConfig,
    getWelcomeField
};