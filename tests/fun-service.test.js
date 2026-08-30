/**
 * tests/fun-service.test.js
 *
 * Tests unitaires pour FunService (Phase 9 G04, G27).
 */

import { describe, it, expect } from 'vitest';
import { FunService } from '../src/modules/util_fun/services/fun.service.js';

describe('Feature G04 & G27: Fun & Text Transformations Tests', () => {
    const service = new FunService();

    it('8ball should return answer for question', () => {
        const res = service.eightBall('Est-ce que le bot est génial ?');
        expect(res.question).toBe('Est-ce que le bot est génial ?');
        expect(typeof res.answer).toBe('string');
        expect(res.answer.length).toBeGreaterThan(0);
    });

    it('rollDice should parse formulas like 2d6, 1d20 and numbers', () => {
        const r1 = service.rollDice('2d6');
        expect(r1.count).toBe(2);
        expect(r1.sides).toBe(6);
        expect(r1.rolls.length).toBe(2);
        expect(r1.total).toBeGreaterThanOrEqual(2);
        expect(r1.total).toBeLessThanOrEqual(12);

        const r2 = service.rollDice('100');
        expect(r2.count).toBe(1);
        expect(r2.sides).toBe(100);
        expect(r2.total).toBeGreaterThanOrEqual(1);
        expect(r2.total).toBeLessThanOrEqual(100);
    });

    it('flipCoin should return Pile or Face', () => {
        const coin = service.flipCoin();
        expect(['Pile', 'Face']).toContain(coin.result);
        expect(['heads', 'tails']).toContain(coin.side);
    });

    it('getRandomMeme should return a meme with title and url', () => {
        const meme = service.getRandomMeme();
        expect(typeof meme.title).toBe('string');
        expect(typeof meme.url).toBe('string');
        expect(meme.url.startsWith('http')).toBe(true);
    });

    it('text transformations: mock, reverse, uppercase, zalgo', () => {
        const mock = service.mockText('hello world');
        expect(mock).toBe('hElLo wOrLd');

        const rev = service.reverseText('salut');
        expect(rev).toBe('tulas');

        const upper = service.uppercaseText('bonjour');
        expect(upper).toBe('BONJOUR');

        const zalgo = service.zalgoText('test');
        expect(zalgo.length).toBeGreaterThan('test'.length);
    });
});
