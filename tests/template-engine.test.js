const { test, describe } = require('node:test');
const assert = require('node:assert');
const templateEngine = require('../src/utils/templateEngine.js');
const { DiscordTemplateEngine } = require('../src/utils/templateEngine.js');

describe('DiscordTemplateEngine Tests', () => {

    test('Variable interpolation and nested properties', () => {
        const tpl = 'Bonjour {{ user.name }} ! Tu as {{ stats.score }} points sur {{ guild.name }}.';
        const ctx = {
            user: { name: 'Alice' },
            stats: { score: 42 },
            guild: { name: 'Obsydian' }
        };

        const result = templateEngine.render(tpl, ctx);
        assert.strictEqual(result, 'Bonjour Alice ! Tu as 42 points sur Obsydian.');
    });

    test('Default filter for missing or empty values', () => {
        const tpl = 'Bienvenue {{ user.nickname | default(user.username) | default("Invité") }} !';
        const ctx1 = { user: { nickname: '', username: 'Bob' } };
        const ctx2 = { user: { nickname: null, username: '' } };

        assert.strictEqual(templateEngine.render(tpl, ctx1), 'Bienvenue Bob !');
        assert.strictEqual(templateEngine.render(tpl, ctx2), 'Bienvenue Invité !');
    });

    test('Chained filters & text styling', () => {
        const tpl = 'Message: {{ text | trim | upper | bold }} - {{ code | code }}';
        const ctx = {
            text: '  attention  ',
            code: 'const x = 10;'
        };

        const result = templateEngine.render(tpl, ctx);
        assert.strictEqual(result, 'Message: **ATTENTION** - `const x = 10;`');
    });

    test('Discord mentions and tags', () => {
        const tpl = '{{ userId | userMention }} {{ channelId | channelMention }} {{ roleId | roleMention }}';
        const ctx = {
            userId: '1337543177086959657',
            channelId: '1337543177086959660',
            roleId: '1337543177086959999'
        };

        const result = templateEngine.render(tpl, ctx);
        assert.strictEqual(result, '<@1337543177086959657> <#1337543177086959660> <@&1337543177086959999>');
    });

    test('Number formatting with commas and decimals', () => {
        const tpl = 'Total: {{ amount | number(2) }} € / Joueurs: {{ players | number }}';
        const ctx = {
            amount: 1250450.75,
            players: 10500
        };

        const result = templateEngine.render(tpl, ctx);
        assert.strictEqual(result, 'Total: 1 250 450,75 € / Joueurs: 10 500');
    });

    test('Conditionals if / elif / else', () => {
        const tpl = '{% if score >= 100 %}🏆 Champion{% elif score >= 50 %}🥈 Argent{% else %}🥉 Bronze{% endif %}';
        
        assert.strictEqual(templateEngine.render(tpl, { score: 120 }), '🏆 Champion');
        assert.strictEqual(templateEngine.render(tpl, { score: 75 }), '🥈 Argent');
        assert.strictEqual(templateEngine.render(tpl, { score: 20 }), '🥉 Bronze');
    });

    test('Handlebars alias {{#if}} ... {{else}} ... {{/if}}', () => {
        const tpl = '{{#if isVip}}⭐ VIP : {{ user.name }}{{else}}👤 Membre standard{{/if}}';
        
        assert.strictEqual(templateEngine.render(tpl, { isVip: true, user: { name: 'Eve' } }), '⭐ VIP : Eve');
        assert.strictEqual(templateEngine.render(tpl, { isVip: false }), '👤 Membre standard');
    });

    test('For loop with loop context for leaderboard', () => {
        const tpl = `🏆 CLASSEMENT DU SERVEUR :
{% for u in leaderboard %}
#{{ loop.index }} {{ u.name | bold }} - {{ u.xp | number }} XP{% if loop.first %} 👑{% endif %}
{% endfor %}`;

        const ctx = {
            leaderboard: [
                { name: 'Alice', xp: 15400 },
                { name: 'Bob', xp: 9800 },
                { name: 'Charlie', xp: 4200 }
            ]
        };

        const result = templateEngine.render(tpl, ctx).trim();
        assert.ok(result.includes('#1 **Alice** - 15 400 XP 👑'));
        assert.ok(result.includes('#2 **Bob** - 9 800 XP'));
        assert.ok(result.includes('#3 **Charlie** - 4 200 XP'));
    });

    test('Handlebars alias {{#each}} for loops', () => {
        const tpl = '{{#each users as user}}[{{ @index }}] {{ user.name }} {{/each}}';
        const ctx = {
            users: [{ name: 'A' }, { name: 'B' }]
        };

        const result = templateEngine.render(tpl, ctx).trim();
        assert.ok(result.includes('A'));
        assert.ok(result.includes('B'));
    });

    test('Discord Embed rendering with dynamic fields, color and author', () => {
        const template = {
            content: 'Annonce importante pour {{ guild.name }} !',
            embed: {
                title: '🎉 Félicitations {{ winner.name }} !',
                description: 'Tu as remporté la saison avec **{{ winner.score }} points**.',
                color: '#5865F2',
                fields: [
                    { name: 'Récompense', value: '{{ reward }}', inline: true },
                    { name: 'Rang', value: '#{{ rank }} / {{ total }}', inline: true }
                ],
                footer: {
                    text: 'Serveur {{ guild.name }}',
                    icon_url: '{{ guild.iconUrl }}'
                }
            }
        };

        const ctx = {
            guild: { name: 'Obsydian', iconUrl: 'https://cdn.discordapp.com/icons/123/icon.png' },
            winner: { name: 'Nosi', score: 9999 },
            reward: 'Rôle Légende + 5000 XP',
            rank: 1,
            total: 250
        };

        const compiled = templateEngine.renderDiscordMessage(template, ctx);

        assert.strictEqual(compiled.content, 'Annonce importante pour Obsydian !');
        assert.strictEqual(compiled.embeds.length, 1);
        const embed = compiled.embeds[0];
        assert.strictEqual(embed.title, '🎉 Félicitations Nosi !');
        assert.strictEqual(embed.description, 'Tu as remporté la saison avec **9999 points**.');
        assert.strictEqual(embed.color, 0x5865F2);
        assert.strictEqual(embed.fields.length, 2);
        assert.strictEqual(embed.fields[0].name, 'Récompense');
        assert.strictEqual(embed.fields[0].value, 'Rôle Légende + 5000 XP');
        assert.strictEqual(embed.footer.text, 'Serveur Obsydian');
    });

    test('Custom filter registration', () => {
        const customEngine = new DiscordTemplateEngine();
        customEngine.registerFilter('reverseText', str => String(str).split('').reverse().join(''));

        const result = customEngine.render('{{ word | reverseText }}', { word: 'DISCORD' });
        assert.strictEqual(result, 'DROCSID');
    });
});
