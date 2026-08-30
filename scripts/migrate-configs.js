#!/usr/bin/env node
/**
 * scripts/migrate-configs.js
 *
 * Phase 3 du plan migrate-to-c12.md.
 * Scanne tous les src/modules/<feature>/config/defaults.js et génère
 * automatiquement data/example/<feature>.config.example.yml (versionné)
 * et data/default/<feature>.config.yml (gitignore, modifiable par admin).
 *
 * Usage :
 *   node scripts/migrate-configs.js              # migration initiale
 *   node scripts/migrate-configs.js --dry-run   # simule sans écrire
 *
 * Le script ne touche PAS au code source (defaults.js reste en place
 * pour la rétrocompatibilité jusqu'à la Phase 6).
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const MODULES_DIR = path.resolve(__dirname, '../src/modules');
const EXAMPLES_DIR = path.resolve(__dirname, '../data/example');
const DEFAULTS_DIR = path.resolve(__dirname, '../data/default');

const DRY_RUN = process.argv.includes('--dry-run');

function toYmlString(name, defaults) {
    const header = [
        `# data/example/${name}.config.yml`,
        `#`,
        `# Template de configuration pour la feature "${name}".`,
        `# Généré automatiquement depuis src/modules/feature_${name.replace(/_/g, '-')}/config/defaults.js.`,
        `#`,
        `# Ne PAS modifier manuellement ici : c'est un exemple versionné.`,
        `# Pour modifier la config par défaut, édite plutôt :`,
        `#   data/default/${name}.config.yml  (modifiable par l'admin, gitignore)`,
        `#   data/{guildId}/${name}.config.yml  (override par guilde, gitignore).`,
        ``
    ].join('\n');
    return header + yaml.stringify(defaults);
}

function migrate() {
    if (!fs.existsSync(EXAMPLES_DIR)) {
        fs.mkdirSync(EXAMPLES_DIR, { recursive: true });
        console.log(`📁 Créé ${EXAMPLES_DIR}`);
    }
    if (!fs.existsSync(DEFAULTS_DIR)) {
        fs.mkdirSync(DEFAULTS_DIR, { recursive: true });
        console.log(`📁 Créé ${DEFAULTS_DIR}`);
    }

    const modules = fs.readdirSync(MODULES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory());

    let count = 0;

    for (const m of modules) {
        const defaultsPath = path.join(MODULES_DIR, m.name, 'config/defaults.js');
        if (!fs.existsSync(defaultsPath)) continue;

        // Extraire le nom de feature du dossier (ex: security_automod → automod, util_temp-voice → temp_voice)
        const featureName = m.name.replace(/^[a-z]+_/, '').replace(/-/g, '_');

        // Charger le defaults.js (CommonJS) en purgeant le cache
        delete require.cache[require.resolve(defaultsPath)];
        const defaults = require(defaultsPath);

        if (typeof defaults !== 'object' || defaults === null) {
            console.warn(`⚠️  ${featureName}: defaults.js n'exporte pas un objet, ignoré`);
            continue;
        }

        const yml = toYmlString(featureName, defaults);

        // Écrire dans example/ (versionné)
        const examplePath = path.join(EXAMPLES_DIR, `${featureName}.config.yml`);
        if (!DRY_RUN) {
            fs.writeFileSync(examplePath, yml, 'utf8');
        }
        console.log(`${DRY_RUN ? '[DRY-RUN] ' : '✓ '}Généré ${examplePath.replace(process.cwd(), '.')}`);

        // Écrire dans default/ (gitignore, modifiable)
        const defaultPath = path.join(DEFAULTS_DIR, `${featureName}.config.yml`);
        if (!fs.existsSync(defaultPath)) {
            if (!DRY_RUN) {
                fs.writeFileSync(defaultPath, yml, 'utf8');
            }
            console.log(`${DRY_RUN ? '[DRY-RUN] ' : '✓ '}Généré ${defaultPath.replace(process.cwd(), '.')}`);
        } else {
            console.log(`= ${defaultPath.replace(process.cwd(), '.')} existe déjà, non touché`);
        }

        count++;
    }

    console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}${count} fichier(s) traité(s).`);
}

migrate();
