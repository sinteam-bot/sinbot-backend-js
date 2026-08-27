#!/usr/bin/env node
/**
 * migrate-config-to-features.js
 *
 * Script de migration one-shot : recopie la configuration YAML legacy
 * (ex: `xp:`, `welcome:`, `counter:`) dans la table `feature_flags`.
 *
 * Idempotent : si une ligne existe déjà pour (guild_id, feature_name),
 * elle n'est pas écrasée (sauf si --force est passé).
 *
 * Note : ce script utilise le format PostgreSQL ($1, $2...) qui est
 * supporté en production. En mode dev in-memory (mock pool), l'adaptateur
 * peut échouer sur les grands entiers (timestamps ms). Le dry-run reste
 * toujours fonctionnel.
 *
 * Usage :
 *   node scripts/migrate-config-to-features.js                 # dry-run (par défaut)
 *   node scripts/migrate-config-to-features.js --apply         # applique la migration
 *   node scripts/migrate-config-to-features.js --apply --force # écrase les valeurs existantes
 *   node scripts/migrate-config-to-features.js --guild=123456  # migre un guild spécifique
 */

const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const GUILD_ARG = argv.find(a => a.startsWith('--guild='));
const SPECIFIC_GUILD = GUILD_ARG ? GUILD_ARG.split('=')[1] : null;

const KNOWN_FEATURES = [
    'xp', 'welcome', 'daily_message', 'counter', 'countdown',
    'bump_reminder', 'captcha'
];

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

const yaml = require('js-yaml');
const yamlPath = path.join(projectRoot, 'config.yml');
if (!fs.existsSync(yamlPath)) {
    console.error(`❌ Fichier config.yml introuvable à ${yamlPath}`);
    process.exit(1);
}

const yamlConfig = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
const { config: liveConfig, getConfig } = require('../src/config/index.js');
const { db, schema } = require('../src/db/index.js');
const { and, eq } = require('drizzle-orm');

const guildId = SPECIFIC_GUILD || process.env.GUILD_ID || (liveConfig.discord && liveConfig.discord.guild_id) || null;
if (!guildId) {
    console.error('❌ Aucun guild_id détecté. Passez --guild=XXX ou définissez GUILD_ID dans .env');
    process.exit(1);
}

async function existingFlag(name) {
    try {
        const rows = await db.select()
            .from(schema.featureFlags)
            .where(and(
                eq(schema.featureFlags.guildId, guildId),
                eq(schema.featureFlags.featureName, name)
            ))
            .limit(1);
        return rows[0] || null;
    } catch (e) {
        return null;
    }
}

async function main() {
    console.log(`╔════════════════════════════════════════════════════╗`);
    console.log(`║  Migration YAML legacy → feature_flags             ║`);
    console.log(`╚════════════════════════════════════════════════════╝`);
    console.log('');
    console.log(`📍 Guild cible : ${guildId}`);
    console.log(`⚙️  Mode        : ${APPLY ? 'APPLY' : 'DRY-RUN'}${FORCE && APPLY ? ' (force overwrite)' : ''}`);
    console.log('');

    let migrated = 0, skipped = 0, errors = 0;

    for (const name of KNOWN_FEATURES) {
        const legacy = yamlConfig[name];
        if (!legacy || typeof legacy !== 'object') {
            console.log(`⏭️  ${name.padEnd(15)} — absent du YAML, ignoré`);
            skipped++;
            continue;
        }

        const already = await existingFlag(name);
        if (already && !FORCE) {
            console.log(`⏭️  ${name.padEnd(15)} — déjà en DB (enabled=${already.enabled}), ignoré`);
            skipped++;
            continue;
        }

        const enabled = legacy.enabled ? 1 : 0;
        const allowedRoles = JSON.stringify(legacy.allowed_roles || []);
        const configJson = JSON.stringify(legacy);

        if (!APPLY) {
            console.log(`🔍 ${name.padEnd(15)} — dry-run : enabled=${!!legacy.enabled}, config keys=${Object.keys(legacy).join(',')}`);
            migrated++;
            continue;
        }

        try {
            const ts = Date.now();
            const updater = 'migration-script';
            if (already) {
                const sql = `UPDATE feature_flags SET enabled = $1, config_json = $2, allowed_roles = $3, updated_by = $4, updated_at = $5 WHERE guild_id = $6 AND feature_name = $7`;
                await db.pool.query({ text: sql, values: [enabled, configJson, allowedRoles, updater, ts, guildId, name] });
                console.log(`✅ ${name.padEnd(15)} — mis à jour en DB (enabled=${!!legacy.enabled})`);
            } else {
                const sql = `INSERT INTO feature_flags (guild_id, feature_name, enabled, config_json, allowed_roles, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
                await db.pool.query({ text: sql, values: [guildId, name, enabled, configJson, allowedRoles, updater, ts] });
                console.log(`✅ ${name.padEnd(15)} — inséré en DB (enabled=${!!legacy.enabled})`);
            }
            migrated++;
        } catch (err) {
            console.error(`❌ ${name.padEnd(15)} — erreur : ${err.message}`);
            errors++;
        }
    }

    console.log('');
    console.log('─'.repeat(56));
    console.log(`📊 Résultat : ${migrated} traité(s), ${skipped} ignoré(s), ${errors} erreur(s)`);

    if (!APPLY) {
        console.log('');
        console.log('ℹ️  Aucune modification n\'a été appliquée. Relancez avec --apply pour migrer.');
    }

    process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('❌ Erreur fatale :', err);
    process.exit(1);
});
