/**
 * CJS bridge for ESM files.
 *
 * Use this module from any `.mjs` file when you need to load a
 * CommonJS module that does not have an ESM export (e.g. discord.js
 * in CJS-only mode, or any legacy CJS code in this repo).
 *
 * Usage in a `.mjs` file:
 *
 *   import { createRequire } from 'node:module';
 *   const { cjs } = createRequire(import.meta.url);
 *   const { Client, GatewayIntentBits } = cjs('discord.js');
 *   const { featureRegistry } = cjs('./core/feature-registry.js');
 *
 * Why this exists:
 * - The project stays CJS at the top level (no "type": "module" in
 *   package.json) because discord.js is still CJS-only.
 * - A growing number of files will be migrated to .mjs (ESM) over
 *   time, and they need a uniform way to load CJS deps.
 * - This module is .cjs (not .mjs) so it can be loaded by both .js
 *   and .mjs callers via dynamic import.
 *
 * The returned function is the Node.js createRequire handle, already
 * bound to the calling .mjs file's URL (which is what you want).
 */
'use strict';

const { createRequire: nodeCreateRequire } = require('node:module');

/**
 * Returns a CJS-require function bound to the calling .mjs file.
 *
 *   const { cjs } = await import('./utils/import.cjs');
 *   const discord = cjs('discord.js');
 *
 * @param {string} url import.meta.url of the calling .mjs file
 * @returns {NodeRequire} a `require` function bound to that URL
 */
function makeCjs(url) {
    return nodeCreateRequire(url);
}

module.exports = { makeCjs };
