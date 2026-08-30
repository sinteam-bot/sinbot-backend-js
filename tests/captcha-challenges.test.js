const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Captcha Challenges — Registry & Generators', () => {

    describe('math challenge', () => {
        const math = require('../src/modules/security_captcha/challenges/math.js');

        test('expose type and label', () => {
            assert.strictEqual(math.type, 'math');
            assert.ok(typeof math.label === 'string' && math.label.length > 0);
        });

        test('generate produces a coherent question+answer', async () => {
            const captchaConfig = {
                math_questions: {
                    min_number: 1,
                    max_number: 10,
                    operations: ['+'],
                    operation_weights: { '+': 1 },
                    use_word_operators: false
                }
            };
            for (let i = 0; i < 30; i++) {
                const r = await math.generate({ captchaConfig });
                assert.ok(r.question.includes('Combien font'));
                assert.ok(/^\d+$/.test(r.answer), `answer "${r.answer}" must be numeric`);
                const match = r.question.match(/Combien font (\w+) (plus|moins|fois|\+|-|\*) (\w+)/);
                assert.ok(match, `Question format: ${r.question}`);
            }
        });

        test('verify accepts correct answer and rejects incorrect', async () => {
            assert.strictEqual(await math.verify({ userAnswer: '7', expectedAnswer: '7' }), true);
            assert.strictEqual(await math.verify({ userAnswer: ' 7 ', expectedAnswer: '7' }), true);
            assert.strictEqual(await math.verify({ userAnswer: '8', expectedAnswer: '7' }), false);
            assert.strictEqual(await math.verify({ userAnswer: 'abc', expectedAnswer: '7' }), false);
        });

        test('fallback uses math via numeric answer in plain config (use_word_operators=false)', async () => {
            const r = await math.generate({
                captchaConfig: {
                    math_questions: { operations: ['+'], min_number: 5, max_number: 5, operation_weights: { '+': 1 } }
                }
            });
            assert.strictEqual(r.answer, '10');
            assert.ok(r.question.includes('+'));
        });
    });

    describe('image challenge', () => {
        const image = require('../src/modules/security_captcha/challenges/image.js');

        test('expose type and label', () => {
            assert.strictEqual(image.type, 'image');
            assert.ok(typeof image.label === 'string' && image.label.length > 0);
        });

        test('verify normalizes case and whitespace', async () => {
            assert.strictEqual(await image.verify({ userAnswer: 'ABCD', expectedAnswer: 'abcd' }), true);
            assert.strictEqual(await image.verify({ userAnswer: 'ABCD', expectedAnswer: 'EFGH' }), false);
        });

        test('generate throws canvas_not_installed if canvas is missing', async () => {
            // canvas n'est pas dans package.json — le require doit échouer
            let canvasFound = true;
            try { require('canvas'); } catch { canvasFound = false; }
            if (canvasFound) {
                // Si par hasard canvas est installé, on fait un test réel
                const r = await image.generate({ captchaConfig: { image_length: 4 } });
                assert.ok(r.answer);
                assert.ok(r.payload.token);
                assert.ok(r.payload.filePath);
                assert.ok(fs.existsSync(r.payload.filePath), 'image file should be created on disk');
                // Cleanup
                fs.unlinkSync(r.payload.filePath);
                return;
            }
            // Canvas absent : on vérifie que l'erreur remonte proprement
            await assert.rejects(
                () => image.generate({ captchaConfig: {} }),
                (err) => err.message === 'canvas_not_installed'
            );
        });

        test('cleanupOldImages removes stale files', async () => {
            // Crée un fichier vieux de 10 minutes
            const tmpDir = image.TMP_DIR;
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const oldFile = path.join(tmpDir, 'old-test.png');
            fs.writeFileSync(oldFile, 'fake-png-content');
            const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
            fs.utimesSync(oldFile, tenMinAgo, tenMinAgo);

            const removed = image.cleanupOldImages(5 * 60 * 1000);
            assert.ok(removed >= 1, `expected at least 1 removed, got ${removed}`);
            assert.ok(!fs.existsSync(oldFile));
        });
    });

    describe('web challenge', () => {
        const web = require('../src/modules/security_captcha/challenges/web.js');

        test('expose type and label', () => {
            assert.strictEqual(web.type, 'web');
            assert.ok(typeof web.label === 'string' && web.label.length > 0);
        });

        test('generate throws if HCAPTCHA_SITE_KEY is missing', async () => {
            const prevSite = process.env.HCAPTCHA_SITE_KEY;
            const prevSite2 = process.env.CAPTCHA_WEB_SITE_KEY;
            delete process.env.HCAPTCHA_SITE_KEY;
            delete process.env.CAPTCHA_WEB_SITE_KEY;
            // Recharger le module pour prendre en compte la nouvelle env
            delete require.cache[require.resolve('../src/modules/security_captcha/challenges/web.js')];
            const fresh = require('../src/modules/security_captcha/challenges/web.js');
            await assert.rejects(
                () => fresh.generate({ captchaConfig: {}, userId: 'u', guildId: 'g' }),
                (err) => err.code === 'HCAPTCHA_NOT_CONFIGURED'
            );
            if (prevSite) process.env.HCAPTCHA_SITE_KEY = prevSite;
            if (prevSite2) process.env.CAPTCHA_WEB_SITE_KEY = prevSite2;
        });

        test('generate + verify full flow (mocked hCaptcha)', async () => {
            process.env.HCAPTCHA_SITE_KEY = 'test-site-key';
            process.env.HCAPTCHA_SECRET = 'test-secret-key';
            delete require.cache[require.resolve('../src/modules/security_captcha/challenges/web.js')];
            const fresh = require('../src/modules/security_captcha/challenges/web.js');

            const gen = await fresh.generate({ captchaConfig: {}, userId: 'u123', guildId: 'g456' });
            assert.ok(gen.answer, 'must produce an initial token');
            assert.ok(gen.payload.verifyUrl.includes('/verify/'));
            assert.strictEqual(gen.payload.siteKey, 'test-site-key');

            // Mock fetch pour la validation hCaptcha
            const originalFetch = global.fetch;
            global.fetch = async () => ({ json: async () => ({ success: true }) });
            try {
                const res = await fresh.verifyHcaptchaAndIssueToken({
                    hcaptchaResponse: 'fake-hcaptcha-response',
                    initialToken: gen.answer,
                    remoteIp: '127.0.0.1'
                });
                assert.ok(res.ok);
                assert.ok(res.validationToken);
                assert.notStrictEqual(res.validationToken, gen.answer);

                // verify rejette le token initial (anti-bypass)
                assert.strictEqual(
                    await fresh.verify({ userAnswer: gen.answer, expectedAnswer: gen.answer }),
                    false
                );

                // verify accepte le validationToken
                assert.strictEqual(
                    await fresh.verify({ userAnswer: res.validationToken, expectedAnswer: gen.answer }),
                    true
                );

                // verify rejette un validationToken d'un autre jti
                const other = await fresh.generate({ captchaConfig: {}, userId: 'u999', guildId: 'g999' });
                assert.strictEqual(
                    await fresh.verify({ userAnswer: res.validationToken, expectedAnswer: other.answer }),
                    false
                );
            } finally {
                global.fetch = originalFetch;
            }
        });

        test('verifyHcaptchaAndIssueToken fails on invalid hcaptcha response', async () => {
            process.env.HCAPTCHA_SECRET = 'test-secret-key';
            delete require.cache[require.resolve('../src/modules/security_captcha/challenges/web.js')];
            const fresh = require('../src/modules/security_captcha/challenges/web.js');

            const originalFetch = global.fetch;
            global.fetch = async () => ({ json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }) });
            try {
                const gen = await fresh.generate({ captchaConfig: {}, userId: 'u1', guildId: 'g1' });
                const res = await fresh.verifyHcaptchaAndIssueToken({
                    hcaptchaResponse: 'invalid',
                    initialToken: gen.answer
                });
                assert.strictEqual(res.ok, false);
                assert.strictEqual(res.error, 'hcaptcha_failed');
                assert.deepStrictEqual(res.errors, ['invalid-input-response']);
            } finally {
                global.fetch = originalFetch;
            }
        });
    });

    describe('registry', () => {
        const { getChallenge, listAvailable, normalizeType } = require('../src/modules/security_captcha/challenges/index.js');
        const { TYPES } = require('../src/modules/security_captcha/challenges/_types.js');

        test('normalizeType falls back to math', () => {
            assert.strictEqual(normalizeType('math'), 'math');
            assert.strictEqual(normalizeType('unknown'), 'math');
            assert.strictEqual(normalizeType(null), 'math');
            assert.strictEqual(normalizeType('image'), 'image');
            assert.strictEqual(normalizeType('web'), 'web');
        });

        test('getChallenge returns the right module for known types', () => {
            assert.strictEqual(getChallenge('math').type, 'math');
            assert.strictEqual(getChallenge('image').type, 'image');
            assert.strictEqual(getChallenge('web').type, 'web');
            assert.strictEqual(getChallenge('unknown').type, 'math');
        });

        test('listAvailable returns at least the registered types', () => {
            const available = listAvailable();
            assert.ok(Array.isArray(available));
            assert.ok(available.length >= 3);
            assert.ok(available.some(t => t.type === 'math'));
            assert.ok(available.some(t => t.type === 'image'));
            assert.ok(available.some(t => t.type === 'web'));
        });

        test('TYPES whitelist is exposed', () => {
            assert.ok(Array.isArray(TYPES));
            assert.ok(TYPES.includes('math'));
            assert.ok(TYPES.includes('image'));
            assert.ok(TYPES.includes('web'));
        });
    });
});

describe('Captcha Challenges — Integration (full pipeline)', () => {
    const { getChallenge } = require('../src/modules/security_captcha/challenges/index.js');

    test('math: generate → store → retrieve → verify success path', async () => {
        const ch = getChallenge('math');
        const generated = await ch.generate({
            captchaConfig: {
                math_questions: { operations: ['+'], min_number: 1, max_number: 20, operation_weights: { '+': 1 } }
            }
        });

        // Simule le stockage en BDD puis la récupération
        const stored = {
            question: generated.question,
            answer: generated.answer,
            attempts: 0,
            is_verified: 0
        };

        // Vérification d'une bonne réponse
        const ok = await ch.verify({ userAnswer: stored.answer, expectedAnswer: stored.answer });
        assert.strictEqual(ok, true);

        // Vérification d'une mauvaise réponse
        const bad = await ch.verify({ userAnswer: '999', expectedAnswer: stored.answer });
        assert.strictEqual(bad, false);
    });

    test('math: payload exposes numeric num1Value/num2Value for TTS', async () => {
        const ch = getChallenge('math');
        const generated = await ch.generate({
            captchaConfig: {
                math_questions: { operations: ['+'], min_number: 5, max_number: 5, operation_weights: { '+': 1 } }
            }
        });
        assert.strictEqual(generated.payload.num1Value, 5);
        assert.strictEqual(generated.payload.num2Value, 5);
        assert.strictEqual(generated.payload.operator, '+');
        assert.strictEqual(generated.answer, '10');
    });

    test('math: respects num1_mode=text (default for backward compatibility)', async () => {
        const ch = getChallenge('math');
        const cfg = {
            math_questions: { operations: ['+'], min_number: 7, max_number: 7, operation_weights: { '+': 1 } }
        };
        for (let i = 0; i < 5; i++) {
            const gen = await ch.generate({ captchaConfig: cfg });
            assert.ok(/sept/.test(gen.question), `Expected "sept" in question "${gen.question}"`);
            assert.ok(!/7/.test(gen.question), `Expected no raw digit 7 in "${gen.question}"`);
        }
    });

    test('math: num1_mode=digit renders numeric digit', async () => {
        const ch = getChallenge('math');
        const cfg = {
            num1_mode: 'digit',
            num2_mode: 'digit',
            operator_mode: 'symbol',
            math_questions: { operations: ['+'], min_number: 7, max_number: 7, operation_weights: { '+': 1 } }
        };
        for (let i = 0; i < 5; i++) {
            const gen = await ch.generate({ captchaConfig: cfg });
            assert.ok(/sept/.test(gen.question) === false, `Should not contain "sept" in "${gen.question}"`);
            assert.ok(/7/.test(gen.question), `Expected digit "7" in "${gen.question}"`);
            assert.ok(gen.question.includes(' + '), `Expected " + " in "${gen.question}"`);
        }
    });

    test('math: operator_mode=text renders word operator', async () => {
        const ch = getChallenge('math');
        const cfg = {
            num1_mode: 'digit',
            num2_mode: 'digit',
            operator_mode: 'text',
            math_questions: { operations: ['*'], min_number: 2, max_number: 2, operation_weights: { '*': 1 } }
        };
        const gen = await ch.generate({ captchaConfig: cfg });
        assert.ok(gen.question.includes('fois'), `Expected "fois" in "${gen.question}"`);
        assert.ok(!gen.question.includes(' * '), `Should not contain raw * in "${gen.question}"`);
    });

    test('math: random mode resolves to text or digit at each call', async () => {
        const ch = getChallenge('math');
        const cfg = {
            num1_mode: 'random',
            num2_mode: 'random',
            operator_mode: 'random',
            math_questions: { operations: ['+'], min_number: 5, max_number: 5, operation_weights: { '+': 1 } }
        };
        const seen = new Set();
        for (let i = 0; i < 50; i++) {
            const gen = await ch.generate({ captchaConfig: cfg });
            seen.add(gen.payload.num1Mode);
            seen.add(gen.payload.num2Mode);
            seen.add(gen.payload.operatorMode);
        }
        // On doit avoir vu au moins 2 valeurs différentes sur 50 essais
        assert.ok(seen.size >= 2, `Expected random variety, saw only: ${[...seen].join(',')}`);
    });

    test('math: invalid mode falls back to defaults', async () => {
        const ch = getChallenge('math');
        const cfg = {
            num1_mode: 'invalid_value',
            num2_mode: 42,
            operator_mode: 'gibberish',
            math_questions: { operations: ['+'], min_number: 7, max_number: 7, operation_weights: { '+': 1 } }
        };
        const gen = await ch.generate({ captchaConfig: cfg });
        assert.strictEqual(gen.payload.num1Mode, 'text', 'invalid num1_mode should fall back to text');
        assert.strictEqual(gen.payload.num2Mode, 'text', 'invalid num2_mode should fall back to text');
        assert.strictEqual(gen.payload.operatorMode, 'symbol', 'invalid operator_mode should fall back to symbol');
    });

    test('math: payload exposes effective modes (num1Mode, num2Mode, operatorMode)', async () => {
        const ch = getChallenge('math');
        const cfg = {
            num1_mode: 'digit',
            num2_mode: 'text',
            operator_mode: 'text',
            math_questions: { operations: ['+'], min_number: 1, max_number: 9, operation_weights: { '+': 1 } }
        };
        const gen = await ch.generate({ captchaConfig: cfg });
        assert.strictEqual(gen.payload.num1Mode, 'digit');
        assert.strictEqual(gen.payload.num2Mode, 'text');
        assert.strictEqual(gen.payload.operatorMode, 'text');
    });

    test('image: generate → verify success path (case-insensitive)', async () => {
        const ch = getChallenge('image');
        let canvasFound = true;
        try { require('canvas'); } catch { canvasFound = false; }
        if (!canvasFound) {
            console.warn('[integration] canvas absent, skip test image');
            return;
        }

        const gen = await ch.generate({ captchaConfig: { image_length: 5 } });
        // Cleanup
        try { fs.unlinkSync(gen.payload.filePath); } catch {}

        assert.strictEqual(await ch.verify({ userAnswer: gen.answer.toLowerCase(), expectedAnswer: gen.answer.toUpperCase() }), true);
        assert.strictEqual(await ch.verify({ userAnswer: 'XXXXX', expectedAnswer: gen.answer }), false);
    });

    test('web: end-to-end with mocked hCaptcha', async () => {
        process.env.HCAPTCHA_SITE_KEY = 'test-site-key';
        process.env.HCAPTCHA_SECRET = 'test-secret-key';
        delete require.cache[require.resolve('../src/modules/security_captcha/challenges/web.js')];
        const ch = require('../src/modules/security_captcha/challenges/web.js');

        const originalFetch = global.fetch;
        global.fetch = async () => ({ json: async () => ({ success: true }) });
        try {
            const gen = await ch.generate({ captchaConfig: {}, userId: 'integ_user', guildId: 'integ_guild' });
            const validation = await ch.verifyHcaptchaAndIssueToken({
                hcaptchaResponse: 'mock-resp',
                initialToken: gen.answer
            });
            assert.ok(validation.ok);

            // Le membre revient sur Discord et tape le validationToken
            const ok = await ch.verify({
                userAnswer: validation.validationToken,
                expectedAnswer: gen.answer
            });
            assert.strictEqual(ok, true);
        } finally {
            global.fetch = originalFetch;
        }
    });
});

describe('Captcha — TTS Accessibilité (helper)', () => {
    const tts = require('../src/modules/security_captcha/challenges/tts.js');

    test('numberToFrench handles basic numbers', () => {
        assert.strictEqual(tts.numberToFrench(0), 'zéro');
        assert.strictEqual(tts.numberToFrench(1), 'un');
        assert.strictEqual(tts.numberToFrench(15), 'quinze');
        assert.strictEqual(tts.numberToFrench(20), 'vingt');
        assert.strictEqual(tts.numberToFrench(67), 'soixante-sept');
        assert.strictEqual(tts.numberToFrench(100), 'cent');
        assert.strictEqual(tts.numberToFrench(200), 'deux cents');
    });

    test('toPhonetic formats math question as French spoken text', () => {
        const p = tts.toPhonetic(7, 8, '*');
        assert.ok(p.includes('sept'));
        assert.ok(p.includes('fois'));
        assert.ok(p.includes('huit'));
        assert.ok(!p.includes('7'));
        assert.ok(!p.includes('*'));
    });

    test('synthesizeWav produces a valid WAV header', () => {
        const buf = tts.synthesizeWav('un plus un');
        // Vérifie le magic number "RIFF"
        assert.strictEqual(buf.slice(0, 4).toString(), 'RIFF');
        assert.strictEqual(buf.slice(8, 12).toString(), 'WAVE');
        // Chunk fmt
        assert.strictEqual(buf.slice(12, 16).toString(), 'fmt ');
        // Chunk data
        assert.strictEqual(buf.slice(36, 40).toString(), 'data');
        // Le buffer contient au moins les 44 octets d'en-tête + des samples
        assert.ok(buf.length > 44);
    });

    test('synthesizeWav duration scales with phoneme count', () => {
        const short = tts.synthesizeWav('un');
        const long = tts.synthesizeWav('un deux trois quatre cinq six sept huit neuf dix');
        assert.ok(long.length > short.length, 'longer text → bigger WAV');
    });

    test('generateTtsAttachment writes a wav file on disk', () => {
        const att = tts.generateTtsAttachment({
            num1: 12,
            num2: 5,
            operator: '+',
            guildId: 'test_guild_tts'
        });
        assert.ok(att.wavBuffer);
        assert.ok(att.wavBuffer.length > 44);
        assert.ok(att.filePath.endsWith('.wav'));
        assert.ok(fs.existsSync(att.filePath), 'WAV file should exist on disk');
        assert.ok(att.phonetic.includes('douze'));
        assert.ok(att.phonetic.includes('plus'));
        assert.ok(att.phonetic.includes('cinq'));

        // Cleanup
        try { fs.unlinkSync(att.filePath); } catch {}
    });

    test('generateTtsAttachment throws on invalid numbers', () => {
        assert.throws(() => tts.generateTtsAttachment({ num1: 'abc', num2: 5, operator: '+' }));
        assert.throws(() => tts.generateTtsAttachment({ num1: NaN, num2: 5, operator: '+' }));
    });

    test('cleanupOldTts removes stale TTS files', () => {
        const tmpDir = tts.TMP_DIR;
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const oldFile = require('path').join(tmpDir, 'tts-test_guild_cleanup-old.wav');
        fs.writeFileSync(oldFile, 'fake-wav-content');
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        fs.utimesSync(oldFile, tenMinAgo, tenMinAgo);

        const removed = tts.cleanupOldTts(5 * 60 * 1000);
        assert.ok(removed >= 1);
        assert.ok(!fs.existsSync(oldFile));
    });

    test('TTS attachment can be plugged into math payload (e2e)', () => {
        const { getChallenge } = require('../src/modules/security_captcha/challenges/index.js');
        const ch = getChallenge('math');
        return ch.generate({
            captchaConfig: {
                math_questions: { operations: ['*'], min_number: 2, max_number: 9, operation_weights: { '*': 1 } }
            }
        }).then((gen) => {
            const att = tts.generateTtsAttachment({
                num1: gen.payload.num1Value,
                num2: gen.payload.num2Value,
                operator: gen.payload.operator,
                guildId: 'test_e2e'
            });
            // Vérifie cohérence : la réponse du WAV doit matcher l'answer math
            const expectedResult = parseInt(gen.payload.num1Value, 10) * parseInt(gen.payload.num2Value, 10);
            assert.strictEqual(parseInt(gen.answer, 10), expectedResult);
            assert.ok(att.phonetic.length > 0);
            try { fs.unlinkSync(att.filePath); } catch {}
        });
    });
});