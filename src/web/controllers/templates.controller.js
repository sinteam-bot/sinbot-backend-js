/**
 * src/web/controllers/templates.controller.js
 *
 * Moteur de templates Discord (rendu et presets).
 */

const express = require('express');
const logger = require('../../utils/logger.js');
const templateEngine = require('../../utils/templateEngine.js');

function createTemplatesRouter() {
    const router = express.Router();

    // POST /template/render
    router.post('/render', (req, res) => {
        try {
            const { template, context } = req.body || {};
            if (!template) {
                return res.status(400).json({ success: false, error: 'Paramètre "template" manquant.' });
            }

            const compiled = templateEngine.renderDiscordMessage(template, context || {});
            res.json({
                success: true,
                data: compiled
            });
        } catch (error) {
            logger.error(`Erreur POST /api/template/render: ${error.message}`, 'WEB');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /template/presets
    router.get('/presets', (req, res) => {
        const presets = [
            {
                id: 'leaderboard',
                name: '🏆 Classement Général (Boucle & Emojis)',
                category: 'GAMES',
                template: {
                    content: '🏆 **Classement officiel de {{ guild.name }}**',
                    embed: {
                        title: 'Classement Général des Membres',
                        description: 'Voici le top des membres les plus actifs :\n\n{% for u in leaderboard %}{% if loop.index == 1 %}🥇{% elif loop.index == 2 %}🥈{% elif loop.index == 3 %}🥉{% else %}**#{{ loop.index }}**{% endif %} {{ u.id | userMention }} — **{{ u.xp | number }} XP** (Niveau {{ u.level }})\n{% endfor %}',
                        color: '#F1C40F',
                        fields: [
                            { name: 'Total Joueurs', value: '{{ totalPlayers | number }} membres', inline: true },
                            { name: 'Saison Actuelle', value: 'Saison {{ season }}', inline: true }
                        ],
                        footer: {
                            text: 'Mis à jour à {{ now | date("HH:mm") }} • {{ guild.name }}',
                            icon_url: '{{ guild.iconUrl }}'
                        }
                    }
                },
                context: {
                    guild: {
                        name: 'Obsydian',
                        iconUrl: 'https://cdn.discordapp.com/embed/avatars/0.png'
                    },
                    now: new Date().toISOString(),
                    season: 4,
                    totalPlayers: 1250,
                    leaderboard: [
                        { id: '1337543177086959657', name: 'Alex', xp: 45200, level: 42 },
                        { id: '1337543177086959658', name: 'Sarah', xp: 38900, level: 36 },
                        { id: '1337543177086959659', name: 'Lucas', xp: 29400, level: 28 },
                        { id: '1337543177086959660', name: 'Emma', xp: 21300, level: 22 },
                        { id: '1337543177086959661', name: 'Maxime', xp: 18500, level: 19 }
                    ]
                }
            },
            {
                id: 'welcome',
                name: '👋 Message de Bienvenue (Embed & Mentions)',
                category: 'WELCOME',
                template: {
                    content: '👋 Bienvenue sur le serveur, {{ member.id | userMention }} !',
                    embed: {
                        title: '🎉 Bienvenue chez {{ guild.name }} !',
                        description: "Nous sommes ravis de t'accueillir parmi nous !\n\nN'hésite pas à consulter les salons suivants :\n• {{ rulesChannelId | channelMention }} pour le règlement\n• {{ generalChannelId | channelMention }} pour faire connaissance\n• {{ rolesChannelId | channelMention }} pour choisir tes rôles",
                        color: '#5865F2',
                        thumbnail: '{{ member.avatarUrl }}',
                        fields: [
                            { name: 'Membre n°', value: '{{ guild.memberCount | number }}', inline: true },
                            { name: 'Compte créé', value: '{{ member.createdAt | timeAgo }}', inline: true }
                        ],
                        footer: {
                            text: "{{ guild.name }} • Système d'Accueil",
                            icon_url: '{{ guild.iconUrl }}'
                        }
                    }
                },
                context: {
                    guild: {
                        name: 'Obsydian',
                        memberCount: 1542,
                        iconUrl: 'https://cdn.discordapp.com/embed/avatars/0.png'
                    },
                    member: {
                        id: '1337543177086959657',
                        username: 'NouveauMembre',
                        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
                        createdAt: new Date(Date.now() - 86400000 * 45).toISOString()
                    },
                    rulesChannelId: '1337543177086959660',
                    generalChannelId: '1337543177086959661',
                    rolesChannelId: '1337543177086959662'
                }
            },
            {
                id: 'bump-reminder',
                name: '🔔 Rappel de Bump Disboard',
                category: 'BUMP',
                template: {
                    content: '{{ roleId | roleMention }} C\'est l\'heure de faire monter le serveur !',
                    embed: {
                        title: '⏰ Le Bump Disboard est de nouveau disponible !',
                        description: 'Tapez **/bump** pour aider **{{ guild.name }}** à gagner en visibilité et attirer de nouveaux membres !\n\nMerci au dernier bumper : {{ lastBumper.id | userMention }} 💖',
                        color: '#2ECC71',
                        fields: [
                            { name: 'Dernier Bump', value: '{{ lastBumpDate | timeAgo }}', inline: true },
                            { name: 'Total Bumps ce mois', value: '{{ totalBumpsThisMonth | number }}', inline: true }
                        ],
                        footer: {
                            text: 'Rappel automatique • Prochain rappel dans 2h'
                        }
                    }
                },
                context: {
                    guild: { name: 'Obsydian' },
                    roleId: '1337543177086959999',
                    lastBumper: { id: '1337543177086959657', username: 'SuperBumper' },
                    lastBumpDate: new Date(Date.now() - 7200000).toISOString(),
                    totalBumpsThisMonth: 142
                }
            },
            {
                id: 'xp-levelup',
                name: '⭐ Montée de Niveau XP',
                category: 'XP',
                template: {
                    content: '✨ Félicitations {{ user.id | userMention }} !',
                    embed: {
                        title: '⭐ Montée de Niveau !',
                        description: 'Bravo **{{ user.username }}**, tu viens de passer au **NIVEAU {{ newLevel }}** ! 🎉\n\n{% if hasReward %}🎁 **Récompense débloquée :** Tu obtiens le rôle {{ rewardRole.id | roleMention }} !{% endif %}',
                        color: '#E67E22',
                        thumbnail: '{{ user.avatarUrl }}',
                        fields: [
                            { name: 'Niveau', value: '{{ oldLevel }} ➔ **{{ newLevel }}**', inline: true },
                            { name: 'XP Total', value: '{{ totalXp | number }} XP', inline: true }
                        ],
                        footer: {
                            text: 'Système d\'expérience • {{ guild.name }}'
                        }
                    }
                },
                context: {
                    guild: { name: 'Obsydian' },
                    user: {
                        id: '1337543177086959657',
                        username: 'ObsyGamer',
                        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png'
                    },
                    oldLevel: 19,
                    newLevel: 20,
                    totalXp: 15400,
                    hasReward: true,
                    rewardRole: { id: '1337543177086959999', name: 'Élite Obsydian' }
                }
            },
            {
                id: 'daily-thought',
                name: '🌅 Pensée du Jour IA',
                category: 'AI',
                template: {
                    content: '🌅 **La Pensée du Jour — {{ now | date("DD/MM/YYYY") }}**',
                    embed: {
                        title: '« {{ quote.title }} »',
                        description: '*{{ quote.text }}*\n\n— **{{ quote.author }}**',
                        color: '#9B59B6',
                        fields: [
                            { name: 'Thème', value: '{{ theme }}', inline: true },
                            { name: 'Généré par', value: 'Bot IA', inline: true }
                        ],
                        footer: {
                            text: 'Passez une excellente journée sur {{ guild.name }} !'
                        }
                    }
                },
                context: {
                    guild: { name: 'Obsydian' },
                    now: new Date().toISOString(),
                    theme: 'Persévérance & Innovation',
                    quote: {
                        title: 'Le voyage vers les étoiles',
                        text: 'Chaque pas en avant, même infime, nous rapproche du sommet de la montagne.',
                        author: 'Sénèque'
                    }
                }
            }
        ];

        res.json({
            success: true,
            data: presets
        });
    });

    return router;
}

module.exports = createTemplatesRouter;
