/**
 * src/modules/util_autofeeds/commands/autofeed.cmd.js
 *
 * Commandes Slash /feed et /autofeed pour la gestion des flux RSS, LootScraper, souscriptions et alertes.
 */

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { Command } = require('../../../core/index.js');
const { AutofeedsService } = require('../services/autofeeds.service.js');
const { AutofeedsSubscriptionService } = require('../services/autofeeds-subscription.service.js');
const { PRESETS } = require('../config/presets.js');

class AutofeedCommands {
    static inject = [AutofeedsService, AutofeedsSubscriptionService];

    constructor(service, subService) {
        this.service = service;
        this.subService = subService;
    }

    // ==========================================
    // SOUS-COMMANDES D'ADMINISTRATION
    // ==========================================

    async executeAdd(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const feedUrl = interaction.options.getString('url');
        const channel = interaction.options.getChannel('salon');
        const name = interaction.options.getString('nom');
        const category = interaction.options.getString('categorie') || 'general';
        const tagsRaw = interaction.options.getString('tags') || '';
        const interval = interaction.options.getInteger('intervalle_minutes') || 15;

        const tags = tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

        const res = await this.service.addFeed({
            guildId: interaction.guild.id,
            channelId: channel.id,
            feedUrl,
            name,
            category,
            tags,
            intervalMinutes: interval
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        const tagStr = tags.length > 0 ? tags.map(t => `#${t}`).join(' ') : 'aucun';
        return interaction.reply({
            content: `✅ Flux ajouté avec succès !\n• Nom : **${res.data.name || res.data.feedUrl}**\n• Catégorie : \`${category}\`\n• Tags : \`${tagStr}\`\n• Salon : <#${channel.id}>\n• ID : \`${res.data.id}\``,
            ephemeral: true
        });
    }

    async executeList(interaction) {
        const list = await this.service.listFeeds(interaction.guild.id);
        if (list.length === 0) {
            return interaction.reply({
                content: 'ℹ️ Aucun flux configuré sur ce serveur. Utilisez `/feed add` ou `/feed presets` pour en installer.',
                ephemeral: true
            });
        }

        const lines = list.map(f => {
            const tags = (f.tags || []).map(t => `#${t}`).join(' ') || '—';
            return `• **${f.name || f.feedType.toUpperCase()}** (\`${f.id.slice(0, 8)}\`) ➔ <#${f.channelId}>\n  └ Catégorie : \`${f.category}\` | Tags : \`${tags}\` | [Lien](${f.feedUrl})`;
        });

        const embed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle(`📰 Flux Actifs (${list.length})`)
            .setDescription(lines.join('\n\n'))
            .setFooter({ text: 'Pour vous abonner à un tag ou une catégorie : /feed subscribe' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executePresets(interaction) {
        const lines = PRESETS.map(p => {
            const tags = (p.tags || []).map(t => `#${t}`).join(' ');
            return `• ${p.icon} **${p.name}**\n  └ *${p.description}*\n  └ Catégorie : \`${p.category}\` • Tags : \`${tags}\``;
        });

        const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('🎁 Catalogue de Flux Prédéfinis (LootScraper, Gaming, News)')
            .setDescription(lines.join('\n\n'))
            .setFooter({ text: 'Cliquez sur un bouton ci-dessous pour l\'installer directement dans ce salon.' });

        // Boutons pour installer les presets les plus populaires
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('autofeed:install:lootscraper-all')
                .setLabel('Tous Jeux Gratuits')
                .setEmoji('🎁')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('autofeed:install:lootscraper-epic')
                .setLabel('Epic Games')
                .setEmoji('🖤')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('autofeed:install:lootscraper-steam')
                .setLabel('Steam')
                .setEmoji('🎮')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('autofeed:install:lootscraper-prime')
                .setLabel('Prime Gaming')
                .setEmoji('📦')
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
            embeds: [embed],
            components: [row1],
            ephemeral: true
        });
    }

    async executeDelete(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const id = interaction.options.getString('id');
        await this.service.deleteFeed(id);

        return interaction.reply({ content: `✅ Flux \`${id}\` supprimé.`, ephemeral: true });
    }

    async executeTest(interaction) {
        const id = interaction.options.getString('id');
        const res = await this.service.testFeed(id);

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        return interaction.reply({
            content: `🧪 Test du flux réussi (${res.data.itemCount} articles trouvés). Dernier article extrait :`,
            embeds: [res.data.previewEmbed],
            ephemeral: true
        });
    }

    // ==========================================
    // SOUS-COMMANDES UTILISATEUR : SOUSCRIPTIONS
    // ==========================================

    async executeSubscribe(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const tag = interaction.options.getString('tag');
        const category = interaction.options.getString('categorie');
        const keyword = interaction.options.getString('mot_cle');
        const feedId = interaction.options.getString('flux_id');
        const mode = interaction.options.getString('mode') || 'mention';

        if (!tag && !category && !keyword && !feedId) {
            return interaction.reply({
                content: '❌ Veuillez préciser au moins un critère : `tag`, `categorie`, `mot_cle` ou `flux_id`.',
                ephemeral: true
            });
        }

        let targetType = 'tag';
        let targetValue = tag;

        if (category) {
            targetType = 'category';
            targetValue = category;
        } else if (keyword) {
            targetType = 'keyword';
            targetValue = keyword;
        } else if (feedId) {
            targetType = 'feed';
            targetValue = feedId;
        }

        const res = await this.subService.subscribe({
            guildId,
            userId,
            targetType,
            targetValue,
            notifyMode: mode
        });

        if (!res.ok) {
            return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        }

        const modeStr = mode === 'dm' ? 'en message privé (DM)' : 'par mention dans le salon';
        return interaction.reply({
            content: `🔔 **Abonnement activé avec succès !**\nVous serez notifié ${modeStr} dès qu'un article correspond à **${targetType} : ${targetValue}**.`,
            ephemeral: true
        });
    }

    async executeUnsubscribe(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const tag = interaction.options.getString('tag');
        const category = interaction.options.getString('categorie');
        const keyword = interaction.options.getString('mot_cle');
        const feedId = interaction.options.getString('flux_id');

        let targetType = 'tag';
        let targetValue = tag;

        if (category) {
            targetType = 'category';
            targetValue = category;
        } else if (keyword) {
            targetType = 'keyword';
            targetValue = keyword;
        } else if (feedId) {
            targetType = 'feed';
            targetValue = feedId;
        }

        const res = await this.subService.unsubscribe({ guildId, userId, targetType, targetValue });
        if (res.deleted) {
            return interaction.reply({
                content: `✅ Vous avez été désabonné de **${targetType} : ${targetValue}**.`,
                ephemeral: true
            });
        }

        return interaction.reply({
            content: `ℹ️ Aucun abonnement actif trouvé pour **${targetType} : ${targetValue}**.`,
            ephemeral: true
        });
    }

    async executeMySubscriptions(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const subs = await this.subService.listUserSubscriptions(guildId, userId);
        if (subs.length === 0) {
            return interaction.reply({
                content: 'ℹ️ Vous n\'avez actuellement aucun abonnement actif sur ce serveur.\nUtilisez `/feed subscribe` pour suivre un tag (ex: `/feed subscribe tag:steam` ou `tag:epic`) ou une catégorie !',
                ephemeral: true
            });
        }

        const lines = subs.map(s => {
            const modeIcon = s.notifyMode === 'dm' ? '📩 DM' : '📢 Mention';
            return `• **${s.targetType.toUpperCase()}** : \`${s.targetValue}\` (${modeIcon}) [ID: \`${s.id.slice(0, 8)}\`]`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle(`🔔 Vos Abonnements (${subs.length})`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Pour vous désabonner : /feed unsubscribe' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ==========================================
    // POINT D'ENTRÉE DU ROUTEUR COMMANDES
    // ==========================================

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':              return this.executeAdd(interaction);
            case 'list':             return this.executeList(interaction);
            case 'presets':          return this.executePresets(interaction);
            case 'delete':           return this.executeDelete(interaction);
            case 'test':             return this.executeTest(interaction);
            case 'subscribe':        return this.executeSubscribe(interaction);
            case 'unsubscribe':      return this.executeUnsubscribe(interaction);
            case 'my-subscriptions': return this.executeMySubscriptions(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }
}

// ----------------------------------------------------
// DÉFINITION DU BUILDER DISCORD (/feed)
// ----------------------------------------------------
const feedBuilder = new SlashCommandBuilder()
    .setName('feed')
    .setDescription('Flux RSS, LootScraper, alertes de jeux gratuits et souscriptions')
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter un flux RSS, YouTube, Reddit ou actualités (Admin)')
            .addStringOption(o => o.setName('url').setDescription('URL du flux RSS, lien YouTube ou subreddit').setRequired(true))
            .addChannelOption(o => o.setName('salon').setDescription('Salon de publication').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName('nom').setDescription('Nom d\'affichage du flux').setRequired(false))
            .addStringOption(o => o.setName('categorie').setDescription('Catégorie (ex: gaming, deals, news, tech)').setRequired(false))
            .addStringOption(o => o.setName('tags').setDescription('Tags séparés par virgules (ex: steam, epic, free)').setRequired(false))
            .addIntegerOption(o => o.setName('intervalle_minutes').setDescription('Intervalle de vérification en minutes (défaut: 15)').setRequired(false).setMinValue(5).setMaxValue(1440))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les flux configurés sur le serveur')
    )
    .addSubcommand(sub =>
        sub.setName('presets')
            .setDescription('Afficher les presets prêts à l\'emploi (LootScraper jeux gratuits, etc.)')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un flux (Admin)')
            .addStringOption(o => o.setName('id').setDescription('Identifiant du flux').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('test')
            .setDescription('Tester l\'extraction d\'un flux et prévisualiser le dernier article')
            .addStringOption(o => o.setName('id').setDescription('Identifiant du flux').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('subscribe')
            .setDescription('S\'abonner à un tag, une catégorie ou un mot-clé pour recevoir des alertes')
            .addStringOption(o => o.setName('tag').setDescription('Tag à suivre (ex: epic, steam, free, pc)').setRequired(false))
            .addStringOption(o => o.setName('categorie').setDescription('Catégorie à suivre (ex: gaming, deals, news)').setRequired(false))
            .addStringOption(o => o.setName('mot_cle').setDescription('Mot-clé spécifique dans le titre ou texte').setRequired(false))
            .addStringOption(o => o.setName('flux_id').setDescription('Identifiant d\'un flux spécifique').setRequired(false))
            .addStringOption(o => o.setName('mode').setDescription('Mode de notification').setRequired(false).addChoices(
                { name: '📢 Mention dans le salon', value: 'mention' },
                { name: '📩 Message Privé (DM)', value: 'dm' }
            ))
    )
    .addSubcommand(sub =>
        sub.setName('unsubscribe')
            .setDescription('Se désabonner d\'un tag, d\'une catégorie ou d\'un mot-clé')
            .addStringOption(o => o.setName('tag').setDescription('Tag à retirer').setRequired(false))
            .addStringOption(o => o.setName('categorie').setDescription('Catégorie à retirer').setRequired(false))
            .addStringOption(o => o.setName('mot_cle').setDescription('Mot-clé à retirer').setRequired(false))
            .addStringOption(o => o.setName('flux_id').setDescription('Identifiant de flux à retirer').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('my-subscriptions')
            .setDescription('Afficher la liste de vos abonnements actifs sur ce serveur')
    );

// Alias /autofeed pour compatibilité descendante
const autofeedBuilder = new SlashCommandBuilder()
    .setName('autofeed')
    .setDescription('Gestion des flux RSS automatiques (alias de /feed)')
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter un flux RSS/Atom')
            .addStringOption(o => o.setName('url').setDescription('URL du flux').setRequired(true))
            .addChannelOption(o => o.setName('salon').setDescription('Salon de publication').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addIntegerOption(o => o.setName('intervalle_minutes').setDescription('Intervalle en minutes').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('Lister les flux'))
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un flux')
            .addStringOption(o => o.setName('id').setDescription('ID du flux').setRequired(true))
    );

Command({ name: 'feed', builder: feedBuilder })(AutofeedCommands.prototype, 'executeMain');
Command({ name: 'autofeed', builder: autofeedBuilder })(AutofeedCommands.prototype, 'executeMain');

module.exports = { AutofeedCommands };
