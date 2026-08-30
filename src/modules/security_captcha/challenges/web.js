/**
 * challenges/web.js — Générateur de challenges Web (hCaptcha).
 *
 * Le bot génère un token opaque (HMAC signé), crée une URL de
 * vérification pointant vers /verify/:token (page HTML statique
 * servie par le bot qui embarque le widget hCaptcha), puis attend
 * que le membre clique le bouton "J'ai validé" dans Discord
 * après avoir résolu le hCaptcha sur la page web.
 *
 * Configuration requise :
 *   - process.env.HCAPTCHA_SITE_KEY  (clé publique affichée côté client)
 *   - process.env.HCAPTCHA_SECRET     (clé privée utilisée pour vérifier)
 *   - process.env.WEB_BASE_URL        (URL publique du bot, ex: https://bot.example.com)
 *
 * Si une de ces variables manque, le générateur renvoie une erreur
 * explicite côté service.
 */

const crypto = require('crypto');

const SECRET = process.env.CAPTCHA_WEB_SECRET || process.env.HCAPTCHA_SECRET || 'change-me-in-production';
const SITE_KEY = process.env.CAPTCHA_WEB_SITE_KEY || process.env.HCAPTCHA_SITE_KEY || '';
const WEB_BASE_URL = (process.env.WEB_BASE_URL || process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * Signe un token opaque (token interne, à usage serveur uniquement).
 * Format : base64(JSON({ uid, gid, exp })).hmac256
 */
function _sign(payload) {
    const json = JSON.stringify(payload);
    const b64 = Buffer.from(json, 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
    return `${b64}.${sig}`;
}

function _unsign(token) {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [b64, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
    try {
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expectedSig, 'utf8'))) return null;
    } catch {
        return null;
    }
    try {
        const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

/**
 * Signe un token de validation (envoyé par la page web → backend).
 * Permet à l'API backend de valider qu'un clic sur "Je suis humain"
 * provient bien de notre page, pas d'un script externe.
 */
function _signValidation(payload) {
    const json = JSON.stringify(payload);
    const b64 = Buffer.from(json, 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
    return `${b64}.${sig}`;
}

async function generate({ captchaConfig = {}, userId, guildId } = {}) {
    if (!SITE_KEY) {
        const err = new Error('hcaptcha_not_configured');
        err.code = 'HCAPTCHA_NOT_CONFIGURED';
        throw err;
    }

    const exp = Date.now() + 5 * 60 * 1000;
    const token = _sign({ uid: userId, gid: guildId, exp, jti: crypto.randomBytes(8).toString('hex') });

    const verifyUrl = `${WEB_BASE_URL}/verify/${token}`;

    return {
        question: 'Clique sur le bouton ci-dessous, résous le hCaptcha sur la page qui s\'ouvre, puis reviens ici et clique sur "J\'ai validé".',
        answer: token, // réponse attendue = token signé (validé côté backend par un endpoint séparé)
        payload: {
            type: 'web',
            token,
            verifyUrl,
            siteKey: SITE_KEY,
            expiresInMs: 5 * 60 * 1000
        }
    };
}

/**
 * Vérifie une réponse de l'utilisateur pour le mode web.
 * La "réponse" attendue est un token de validation généré par le backend
 * après vérification réussie du hCaptcha côté web.
 *
 * Signature attendue : { userAnswer: '<token_signé>', expectedAnswer: '<token_signé_à_la_création>' }
 *
 * Pour des raisons de sécurité, on vérifie que les deux tokens ont été
 * signés avec notre SECRET (i.e. la validation n'est pas forgeable).
 * Le frontend (page /verify) appelle POST /api/captcha/web-verify avec
 * la réponse hCaptcha ; le backend vérifie, et stocke un
 * "validationToken" côté serveur que l'utilisateur renvoie ensuite.
 */
async function verify({ userAnswer, expectedAnswer, payload = {} }) {
    if (typeof userAnswer !== 'string' || typeof expectedAnswer !== 'string') return false;

    // Cas 1 : userAnswer === expectedAnswer (le membre a juste renvoyé
    // le token initial — équivalent à un bypass, on l'autorise seulement
    // si le payload contient un "validationToken" distinct).
    if (userAnswer === expectedAnswer) {
        return false;
    }

    // Cas 2 : userAnswer est un validationToken distinct, signé, qui doit
    // référencer le même jti que le token initial.
    const initPayload = _unsign(expectedAnswer);
    const validPayload = _unsign(userAnswer);
    if (!initPayload || !validPayload) return false;

    return initPayload.jti && validPayload.jti === initPayload.jti && validPayload.uid === initPayload.uid;
}

/**
 * Helper utilisé par la route backend /api/captcha/web-verify :
 * - reçoit la réponse hCaptcha (token hCaptcha + token initial)
 * - appelle l'API hCaptcha pour valider le token hCaptcha
 * - si OK, génère un validationToken signé et le renvoie au frontend
 */
async function verifyHcaptchaAndIssueToken({ hcaptchaResponse, initialToken, remoteIp = null }) {
    if (!process.env.HCAPTCHA_SECRET && !process.env.CAPTCHA_WEB_SECRET) {
        return { ok: false, error: 'hcaptcha_secret_missing' };
    }
    const initialPayload = _unsign(initialToken);
    if (!initialPayload) return { ok: false, error: 'invalid_or_expired_token' };

    const secret = process.env.HCAPTCHA_SECRET || process.env.CAPTCHA_WEB_SECRET;
    const params = new URLSearchParams();
    params.set('secret', secret);
    params.set('response', hcaptchaResponse);
    if (remoteIp) params.set('remoteip', remoteIp);

    let verifyRes;
    try {
        const r = await fetch('https://hcaptcha.com/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        verifyRes = await r.json();
    } catch (err) {
        return { ok: false, error: 'hcaptcha_network_error', detail: err.message };
    }

    if (!verifyRes || verifyRes.success !== true) {
        return { ok: false, error: 'hcaptcha_failed', errors: verifyRes?.['error-codes'] || [] };
    }

    // Génère un validationToken signé à présenter à Discord
    const validationToken = _signValidation({
        uid: initialPayload.uid,
        gid: initialPayload.gid,
        jti: initialPayload.jti,
        exp: Date.now() + 60 * 1000, // 1 min pour cliquer sur Discord
        kind: 'validation'
    });

    return { ok: true, validationToken, jti: initialPayload.jti };
}

module.exports = {
    type: 'web',
    label: 'hCaptcha (page web externe)',
    generate,
    verify,
    verifyHcaptchaAndIssueToken,
    SITE_KEY,
    WEB_BASE_URL
};