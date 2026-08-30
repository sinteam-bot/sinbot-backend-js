/**
 * src/modules/util_fun/commands/fun.cmd.js
 *
 * Commandes Slash pour les commandes Fun et transformations de texte (Phase 9 G04, G27).
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { FunService } = require('../services/fun.service.js');

class FunCommands {
    static inject = [FunService];

    constructor(service) {
        this.service = service;
    }

    async executeEightBall(interaction) {
        const question = interaction.options.getString('question');
        const res = this.service.eightBall(question);

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('🎱 Magic 8-Ball')
            .addFields(
                { name: '❓ Question', value: question },
                { name: '🔮 Réponse', value: `*${res.answer}*` }
            );

        return interaction.reply({ embeds: [embed] });
    }

    async executeRoll(interaction) {
        const expr = interaction.options.getString('des') || '1d6';
        const res = this.service.rollDice(expr);

        const rollList = res.rolls.length > 1 ? ` (${res.rolls.join(' + ')})` : '';
        const embed = new EmbedBuilder()
            .setColor(0xE67E22)
            .setTitle('🎲 Lancer de dés')
            .setDescription(`Formule : \`${res.expression}\`\nRésultat : **${res.total}**${rollList}`);

        return interaction.reply({ embeds: [embed] });
    }

    async executeCoinflip(interaction) {
        const res = this.service.flipCoin();
        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🪙 Pile ou Face')
            .setDescription(`La pièce est tombée sur... **${res.result}** !`);

        return interaction.reply({ embeds: [embed] });
    }

    async executeMeme(interaction) {
        const meme = this.service.getRandomMeme();
        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`😂 ${meme.title}`)
            .setImage(meme.url);

        return interaction.reply({ embeds: [embed] });
    }

    async executeTextTransform(interaction) {
        const type = interaction.options.getString('type');
        const text = interaction.options.getString('texte');

        let result = text;
        if (type === 'mock') result = this.service.mockText(text);
        else if (type === 'reverse') result = this.service.reverseText(text);
        else if (type === 'uppercase') result = this.service.uppercaseText(text);
        else if (type === 'zalgo') result = this.service.zalgoText(text, 3);

        return interaction.reply({ content: result });
    }
}

// 8ball
const eightBallBuilder = new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Pose une question à la boule magique 8-Ball')
    .addStringOption(o => o.setName('question').setDescription('Ta question').setRequired(true));
Command({ name: '8ball', builder: eightBallBuilder })(FunCommands.prototype, 'executeEightBall');

// roll
const rollBuilder = new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Lance un ou plusieurs dés (ex: 1d6, 2d20, 100)')
    .addStringOption(o => o.setName('des').setDescription('Formule de dés (ex: 2d6, 1d20)').setRequired(false));
Command({ name: 'roll', builder: rollBuilder })(FunCommands.prototype, 'executeRoll');

// coinflip
const coinflipBuilder = new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Lance une pièce de monnaie (Pile ou Face)');
Command({ name: 'coinflip', builder: coinflipBuilder })(FunCommands.prototype, 'executeCoinflip');

// meme
const memeBuilder = new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Affiche un meme aléatoire');
Command({ name: 'meme', builder: memeBuilder })(FunCommands.prototype, 'executeMeme');

// text-transform
const textTransformBuilder = new SlashCommandBuilder()
    .setName('text-transform')
    .setDescription('Transforme du texte de manière amusante')
    .addStringOption(o =>
        o.setName('type')
            .setDescription('Type de transformation')
            .setRequired(true)
            .addChoices(
                { name: 'MoCk (MoDe MoCk)', value: 'mock' },
                { name: 'Inverse (esrevnI)', value: 'reverse' },
                { name: 'MAJUSCULES', value: 'uppercase' },
                { name: 'Zalgo (G̷l̸i̷t̶c̴h̵)', value: 'zalgo' }
            )
    )
    .addStringOption(o => o.setName('texte').setDescription('Le texte à transformer').setRequired(true));
Command({ name: 'text-transform', builder: textTransformBuilder })(FunCommands.prototype, 'executeTextTransform');

module.exports = { FunCommands };
