/**
 * src/modules/util_fun/controllers/fun.controller.js
 *
 * Contrôleur REST pour les fonctions Fun et text-transform.
 */

const { Controller, Get, Post } = require('../../../core/index.js');
const { FunService } = require('../services/fun.service.js');

class FunController {
    static inject = [FunService];

    constructor(service) {
        this.service = service;
    }

    async eightBall(req) {
        const question = req.query?.question || 'Vais-je réussir ?';
        return { success: true, data: this.service.eightBall(question) };
    }

    async roll(req) {
        const expr = req.query?.expression || '1d6';
        return { success: true, data: this.service.rollDice(expr) };
    }

    async coinflip() {
        return { success: true, data: this.service.flipCoin() };
    }

    async meme() {
        return { success: true, data: this.service.getRandomMeme() };
    }

    async transform(req) {
        const { type = 'mock', text = '' } = req.body || {};
        let result = text;
        if (type === 'mock') result = this.service.mockText(text);
        else if (type === 'reverse') result = this.service.reverseText(text);
        else if (type === 'uppercase') result = this.service.uppercaseText(text);
        else if (type === 'zalgo') result = this.service.zalgoText(text, 3);

        return { success: true, data: { original: text, type, result } };
    }
}

Controller('/api/fun')(FunController);
Get('/8ball')(FunController.prototype, 'eightBall');
Get('/roll')(FunController.prototype, 'roll');
Get('/coinflip')(FunController.prototype, 'coinflip');
Get('/meme')(FunController.prototype, 'meme');
Post('/transform')(FunController.prototype, 'transform');

module.exports = { FunController };
