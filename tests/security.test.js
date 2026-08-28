const assert = require('node:assert');

const {
    timingSafeEqual,
    isDiscordSnowflake,
    validateChannelId,
    validateMessageId,
    validateMessageContent,
    validateEmbed,
    createRateLimiters,
    validateDiscordParamsMiddleware,
    DISCORD_MAX_MESSAGE_LENGTH,
    DISCORD_MAX_TITLE_LENGTH
} = require('../src/utils/security.js');

// ==========================================================
// 1. timingSafeEqual
// ==========================================================
describe('timingSafeEqual', () => {
    test('retourne true pour deux chaînes identiques', () => {
        assert.strictEqual(timingSafeEqual('abc123', 'abc123'), true);
    });

    test('retourne false pour deux chaînes différentes', () => {
        assert.strictEqual(timingSafeEqual('abc123', 'xyz789'), false);
    });

    test('retourne false pour des longueurs différentes', () => {
        assert.strictEqual(timingSafeEqual('short', 'longer_string'), false);
    });

    test('retourne false si une chaîne est vide', () => {
        assert.strictEqual(timingSafeEqual('', 'abc'), false);
        assert.strictEqual(timingSafeEqual('abc', ''), false);
        assert.strictEqual(timingSafeEqual('', ''), false);
    });

    test('retourne false pour des types non-string', () => {
        assert.strictEqual(timingSafeEqual(null, 'abc'), false);
        assert.strictEqual(timingSafeEqual('abc', undefined), false);
        assert.strictEqual(timingSafeEqual(123, 'abc'), false);
        assert.strictEqual(timingSafeEqual('abc', 456), false);
    });

    test('gère correctement les caractères unicode', () => {
        assert.strictEqual(timingSafeEqual('héllo wörld', 'héllo wörld'), true);
        assert.strictEqual(timingSafeEqual('héllo', 'hello'), false);
    });
});

// ==========================================================
// 2. isDiscordSnowflake
// ==========================================================
describe('isDiscordSnowflake', () => {
    test('accepte un snowflake valide (17-20 chiffres)', () => {
        assert.strictEqual(isDiscordSnowflake('1337543177086959657'), true);
        assert.strictEqual(isDiscordSnowflake('12345678901234567'), true);    // 17 chiffres
        assert.strictEqual(isDiscordSnowflake('12345678901234567890'), true); // 20 chiffres
    });

    test('rejette les identifiants trop courts', () => {
        assert.strictEqual(isDiscordSnowflake('1234567890123456'), false);     // 16 chiffres
        assert.strictEqual(isDiscordSnowflake('123'), false);
    });

    test('rejette les identifiants trop longs', () => {
        assert.strictEqual(isDiscordSnowflake('123456789012345678901'), false); // 21 chiffres
    });

    test('rejette les identifiants non numériques', () => {
        assert.strictEqual(isDiscordSnowflake('abc12345678901234'), false);
        assert.strictEqual(isDiscordSnowflake('1337543177086959x57'), false);
    });

    test('rejette les types non-string', () => {
        assert.strictEqual(isDiscordSnowflake(1337543177086959657n), false);
        assert.strictEqual(isDiscordSnowflake(null), false);
        assert.strictEqual(isDiscordSnowflake(undefined), false);
    });
});

// ==========================================================
// 3. validateChannelId
// ==========================================================
describe('validateChannelId', () => {
    test('accepte un snowflake valide', () => {
        const result = validateChannelId('1337543177086959657');
        assert.strictEqual(result.valid, true);
    });

    test('accepte les identifiants virtuels du dashboard', () => {
        assert.strictEqual(validateChannelId('cat-123').valid, true);
        assert.strictEqual(validateChannelId('virtual-logs').valid, true);
    });

    test('rejette un channelId vide ou null', () => {
        assert.strictEqual(validateChannelId('').valid, false);
        assert.strictEqual(validateChannelId(null).valid, false);
        assert.strictEqual(validateChannelId(undefined).valid, false);
    });

    test('rejette un channelId invalide avec un message d\'erreur', () => {
        const result = validateChannelId('not-a-snowflake');
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason.includes('invalide'));
    });
});

// ==========================================================
// 4. validateMessageId
// ==========================================================
describe('validateMessageId', () => {
    test('accepte un snowflake valide', () => {
        assert.strictEqual(validateMessageId('1337543177086959657').valid, true);
    });

    test('rejette un messageId vide', () => {
        assert.strictEqual(validateMessageId('').valid, false);
    });

    test('rejette un messageId invalide', () => {
        const result = validateMessageId('abc');
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason.includes('invalide'));
    });
});

// ==========================================================
// 5. validateMessageContent
// ==========================================================
describe('validateMessageContent', () => {
    test('accepte un message valide', () => {
        const result = validateMessageContent('Bonjour !');
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.sanitized, 'Bonjour !');
    });

    test('trimme les espaces du message', () => {
        const result = validateMessageContent('  hello  ');
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.sanitized, 'hello');
    });

    test('rejette un contenu null ou undefined', () => {
        assert.strictEqual(validateMessageContent(null).valid, false);
        assert.strictEqual(validateMessageContent(undefined).valid, false);
    });

    test('rejette un contenu non-string', () => {
        assert.strictEqual(validateMessageContent(12345).valid, false);
    });

    test('rejette un message vide par défaut', () => {
        assert.strictEqual(validateMessageContent('').valid, false);
        assert.strictEqual(validateMessageContent('   ').valid, false);
    });

    test('accepte un message vide si allowEmpty est true', () => {
        assert.strictEqual(validateMessageContent('', { allowEmpty: true }).valid, true);
    });

    test('rejette un message trop long', () => {
        const longMessage = 'a'.repeat(2001);
        const result = validateMessageContent(longMessage);
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason.includes('2000'));
    });

    test('accepte un message de la longueur maximale exacte', () => {
        const maxMessage = 'a'.repeat(2000);
        assert.strictEqual(validateMessageContent(maxMessage).valid, true);
    });

    test('respecte une limite personnalisée', () => {
        assert.strictEqual(validateMessageContent('abc', { maxLength: 2 }).valid, false);
        assert.strictEqual(validateMessageContent('ab', { maxLength: 2 }).valid, true);
    });
});

// ==========================================================
// 6. validateEmbed
// ==========================================================
describe('validateEmbed', () => {
    test('accepte un embed null ou absent', () => {
        assert.strictEqual(validateEmbed(null).valid, true);
        assert.strictEqual(validateEmbed(undefined).valid, true);
    });

    test('accepte un embed valide', () => {
        assert.strictEqual(validateEmbed({ title: 'Test', description: 'Description' }).valid, true);
    });

    test('rejette un embed avec un titre trop long', () => {
        const result = validateEmbed({ title: 'a'.repeat(257) });
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason.includes('256'));
    });

    test('rejette un embed avec une description trop longue', () => {
        const result = validateEmbed({ description: 'a'.repeat(4097) });
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason.includes('4096'));
    });

    test('rejette un embed avec trop de champs', () => {
        const fields = Array.from({ length: 26 }, (_, i) => ({ name: `F${i}`, value: `V${i}` }));
        const result = validateEmbed({ fields });
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason.includes('25'));
    });
});

// ==========================================================
// 7. createRateLimiters
// ==========================================================
describe('createRateLimiters', () => {
    test('retourne un objet avec tous les limiteurs configurés', () => {
        const limiters = createRateLimiters();
        assert.ok(typeof limiters.global === 'function');
        assert.ok(typeof limiters.auth === 'function');
        assert.ok(typeof limiters.webhook === 'function');
        assert.ok(typeof limiters.write === 'function');
        assert.ok(typeof limiters.aiGeneration === 'function');
        assert.ok(typeof limiters.sensitive === 'function');
    });
});

// ==========================================================
// 8. validateDiscordParamsMiddleware
// ==========================================================
describe('validateDiscordParamsMiddleware', () => {
    const mockRes = () => {
        const res = {
            statusCode: 200,
            body: null,
            status(code) { res.statusCode = code; return res; },
            json(data) { res.body = data; return res; }
        };
        return res;
    };

    test('passe si aucun param Discord n\'est présent', () => {
        const req = { params: {} };
        const res = mockRes();
        let called = false;
        validateDiscordParamsMiddleware(req, res, () => { called = true; });
        assert.strictEqual(called, true);
    });

    test('passe si channelId est un snowflake valide', () => {
        const req = { params: { channelId: '1337543177086959657' } };
        const res = mockRes();
        let called = false;
        validateDiscordParamsMiddleware(req, res, () => { called = true; });
        assert.strictEqual(called, true);
    });

    test('bloque si channelId est invalide', () => {
        const req = { params: { channelId: 'invalid' } };
        const res = mockRes();
        let called = false;
        validateDiscordParamsMiddleware(req, res, () => { called = true; });
        assert.strictEqual(called, false);
        assert.strictEqual(res.statusCode, 400);
    });

    test('bloque si messageId est invalide', () => {
        const req = { params: { messageId: 'not-a-snowflake' } };
        const res = mockRes();
        let called = false;
        validateDiscordParamsMiddleware(req, res, () => { called = true; });
        assert.strictEqual(called, false);
        assert.strictEqual(res.statusCode, 400);
    });

    test('bloque si userId est invalide', () => {
        const req = { params: { userId: 'abc' } };
        const res = mockRes();
        let called = false;
        validateDiscordParamsMiddleware(req, res, () => { called = true; });
        assert.strictEqual(called, false);
        assert.strictEqual(res.statusCode, 400);
    });
});

// ==========================================================
// 9. Constantes
// ==========================================================
describe('Constantes', () => {
    test('DISCORD_MAX_MESSAGE_LENGTH vaut 2000', () => {
        assert.strictEqual(DISCORD_MAX_MESSAGE_LENGTH, 2000);
    });

    test('DISCORD_MAX_TITLE_LENGTH vaut 100', () => {
        assert.strictEqual(DISCORD_MAX_TITLE_LENGTH, 100);
    });
});
