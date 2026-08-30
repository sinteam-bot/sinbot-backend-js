/**
 * challenges/image.js — Générateur de captchas visuels (OCR sur image).
 *
 * Génère une image PNG avec un texte déformé à recopier. Utilise la
 * bibliothèque `canvas` (native). Si canvas n'est pas installé ou ne
 * peut pas être chargé, le générateur renvoie une erreur explicite.
 *
 * L'image générée est stockée temporairement sur disque dans
 * data/captcha-tmp/{token}.png avec un TTL (cleanup géré par le service).
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

function _loadCanvas() {
    try {
        // eslint-disable-next-line global-require
        return require('canvas');
    } catch (err) {
        const e = new Error('canvas_not_installed');
        e.cause = err;
        throw e;
    }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I/L pour éviter la confusion

function randomString(length) {
    const chars = [];
    for (let i = 0; i < length; i++) {
        chars.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
    }
    return chars.join('');
}

async function generate({ captchaConfig = {} } = {}) {
    const canvasMod = _loadCanvas();
    ensureTmpDir();

    const length = Math.max(3, Math.min(8, captchaConfig.image_length || 5));
    const width = 240;
    const height = 80;
    const canvas = canvasMod.createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fond dégradé
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#f2c7ce');
    grad.addColorStop(1, '#ffe6e6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Bruit (petits cercles)
    ctx.fillStyle = 'rgba(80,80,80,0.35)';
    for (let i = 0; i < 60; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    const answer = randomString(length);
    const fontSize = 38;
    ctx.font = `bold ${fontSize}px "Liberation Sans", "DejaVu Sans", sans-serif`;
    ctx.textBaseline = 'middle';

    const cellWidth = width / (length + 1);
    for (let i = 0; i < answer.length; i++) {
        const ch = answer[i];
        const x = cellWidth * (i + 1);
        const y = height / 2 + (Math.random() * 12 - 6);

        // Rotation
        const angle = (Math.random() - 0.5) * 0.7;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Couleur par caractère (pour varier)
        const colors = ['#1f1f23', '#3a3a3f', '#1a3263', '#7d1717', '#0f5132'];
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.fillText(ch, 0, 0);

        ctx.restore();
    }

    // Lignes traversantes
    ctx.strokeStyle = 'rgba(80,80,80,0.5)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * width, Math.random() * height);
        ctx.bezierCurveTo(
            Math.random() * width, Math.random() * height,
            Math.random() * width, Math.random() * height,
            Math.random() * width, Math.random() * height
        );
        ctx.stroke();
    }

    const buffer = canvas.toBuffer('image/png');
    const token = crypto.randomBytes(16).toString('hex');
    const filePath = path.join(TMP_DIR, `${token}.png`);
    fs.writeFileSync(filePath, buffer);

    return {
        question: 'Recopie le texte affiché sur l\'image (sans espaces, majuscules/minuscules indifférentes).',
        answer,
        payload: {
            type: 'image',
            token,
            filePath,
            filename: `captcha-${token}.png`,
            expiresInMs: 5 * 60 * 1000
        }
    };
}

async function verify({ userAnswer, expectedAnswer }) {
    if (typeof userAnswer !== 'string' || typeof expectedAnswer !== 'string') return false;
    return userAnswer.trim().toUpperCase() === expectedAnswer.trim().toUpperCase();
}

/**
 * Nettoie les fichiers d'image plus vieux que `maxAgeMs`.
 */
function cleanupOldImages(maxAgeMs = 5 * 60 * 1000) {
    if (!fs.existsSync(TMP_DIR)) return 0;
    const now = Date.now();
    let removed = 0;
    for (const file of fs.readdirSync(TMP_DIR)) {
        if (!file.endsWith('.png')) continue;
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
    type: 'image',
    label: 'Reconnaissance de texte sur image',
    generate,
    verify,
    cleanupOldImages,
    TMP_DIR
};