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
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
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
        const account = interaction.options.getString('compte');
        const feedId = interaction.options.getString('flux_id');
        const mode = interaction.options.getString('mode') || 'mention';

        if (!tag && !category && !keyword && !account && !feedId) {
            return interaction.reply({
                content: '❌ Veuillez préciser au moins un critère : `tag`, `compte`, `categorie`, `mot_cle` ou `flux_id`.',
                ephemeral: true
            });
        }

        let targetType = 'tag';
        let targetValue = tag;

        if (category) {
            targetType = 'category';
            targetValue = category;
        } else if (account) {
            targetType = 'account';
            targetValue = account.replace('@', '').trim();
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

        // Si le flux a un rôle de souscripteur dédié, l'attribuer au membre
        if (targetType === 'feed' && interaction.member?.roles?.add) {
            const feed = await this.service.getFeed(targetValue);
            if (feed?.subscriberRoleId) {
                await interaction.member.roles.add(feed.subscriberRoleId).catch(() => {});
            }
        }

        let modeStr = 'par mention dans le salon';
        if (mode === 'dm') modeStr = 'en message privé (DM)';
        else if (mode === 'both') modeStr = 'dans le salon et en message privé (DM)';
        else if (mode === 'role') modeStr = 'via l\'attribution du rôle dédié';

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
        const account = interaction.options.getString('compte');
        const feedId = interaction.options.getString('flux_id');

        let targetType = 'tag';
        let targetValue = tag;

        if (category) {
            targetType = 'category';
            targetValue = category;
        } else if (account) {
            targetType = 'account';
            targetValue = account.replace('@', '').trim();
        } else if (keyword) {
            targetType = 'keyword';
            targetValue = keyword;
        } else if (feedId) {
            targetType = 'feed';
            targetValue = feedId;
        }

        const res = await this.subService.unsubscribe({ guildId, userId, targetType, targetValue });
        if (res.deleted) {
            // Si le flux avait un rôle dédié, le retirer
            if (targetType === 'feed' && interaction.member?.roles?.remove) {
                const feed = await this.service.getFeed(targetValue);
                if (feed?.subscriberRoleId) {
                    await interaction.member.roles.remove(feed.subscriberRoleId).catch(() => {});
                }
            }

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

    async executeStreamers(interaction) {
        const list = await this.service.listFeeds(interaction.guild.id);
        const liveFeeds = list.filter(f => ['twitch', 'kick', 'youtube_live'].includes(f.feedType));
        if (liveFeeds.length === 0) {
            return interaction.reply({
                content: 'ℹ️ Aucun streamer ou direct configuré sur ce serveur.',
                ephemeral: true
            });
        }

        const lines = [];
        for (const f of liveFeeds) {
            const active = await this.service.repo.getActiveLiveSession(f.id);
            if (active) {
                const gameStr = active.game ? ` sur **${active.game}**` : '';
                lines.push(`🔴 **${active.streamerName}** — **EN DIRECT**${gameStr} !\n   └ [Regarder le direct](${active.url || f.feedUrl})`);
            } else {
                lines.push(`⚫ **${f.name || f.feedType.toUpperCase()}** — *Hors ligne*\n   └ [Chaîne](${f.feedUrl})`);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x9146FF)
            .setTitle(`📺 Statut des Streamers (${liveFeeds.length})`)
            .setDescription(lines.join('\n\n'))
            .setFooter({ text: 'Pour recevoir une alerte dès qu\'un streamer passe en direct : /feed subscribe' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executePause(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const feed = await this.service.getFeed(id);
        if (!feed) {
            return interaction.reply({ content: `❌ Flux \`${id}\` introuvable.`, ephemeral: true });
        }
        const newStatus = !feed.enabled;
        await this.service.updateFeed(id, { enabled: newStatus });
        return interaction.reply({
            content: `✅ Flux **${feed.name || id}** ${newStatus ? '🟢 réactivé' : '⏸️ mis en pause'}.`,
            ephemeral: true
        });
    }

    async executeMySubscriptions(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const subs = await this.subService.listUserSubscriptions(guildId, userId);
        if (subs.length === 0) {
            return interaction.reply({
                content: 'ℹ️ Vous n\'avez actuellement aucun abonnement actif sur ce serveur.\nUtilisez `/feed subscribe` pour suivre un créateur ou un tag (ex: `/feed subscribe tag:steam`) !',
                ephemeral: true
            });
        }

        const lines = subs.map(s => {
            let modeIcon = '📢 Mention';
            if (s.notifyMode === 'dm') modeIcon = '📩 DM';
            else if (s.notifyMode === 'both') modeIcon = '🔔 Salon + DM';
            else if (s.notifyMode === 'role') modeIcon = '🏷️ Rôle';
            return `• **${s.targetType.toUpperCase()}** : \`${s.targetValue}\` (${modeIcon}) [ID: \`${s.id.slice(0, 8)}\`]`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle(`🔔 Vos Abonnements (${subs.length})`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Pour vous désabonner : /feed unsubscribe' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeMenu(interaction) {
        const guildId = interaction.guild?.id || 'default';
        const feeds = await this.service.listFeeds(guildId);
        const activeFeeds = feeds.filter(f => f.enabled !== false);

        if (activeFeeds.length === 0) {
            return interaction.reply({
                content: 'ℹ️ Aucun flux actif disponible sur ce serveur pour le moment.',
                ephemeral: true
            });
        }

        // Discord Select Menu supports max 25 items
        const menuOptions = activeFeeds.slice(0, 25).map(f => {
            const label = (f.name || f.feedType || 'Flux').slice(0, 100);
            let description = (f.category ? `Catégorie: ${f.category}` : (f.feedUrl || '')).slice(0, 100);
            if (!description) description = 'Flux RSS';

            let emoji = '📰';
            if (f.feedType === 'twitch') emoji = '🟣';
            else if (f.feedType === 'kick') emoji = '🟢';
            else if (f.feedType === 'youtube') emoji = '🔴';
            else if (f.feedType === 'reddit') emoji = '🟠';
            else if (f.feedType === 'bluesky') emoji = '🦋';
            else if (f.feedType === 'twitter') emoji = '🐦';
            else if (f.category === 'deals' || f.category === 'gaming') emoji = '🎮';

            return {
                label,
                description,
                value: f.id,
                emoji
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('autofeed:select_menu')
            .setPlaceholder('Sélectionnez les flux à suivre...')
            .setMinValues(1)
            .setMaxValues(menuOptions.length)
            .addOptions(menuOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📬 Menu Interactif d\'Abonnements')
            .setDescription(
                'Sélectionnez ci-dessous les flux d\'actualités, créateurs ou notifications que vous souhaitez suivre personnellement sur ce serveur.\n\n' +
                '✨ *Vos préférences seront instantanément enregistrées !*'
            )
            .setFooter({ text: 'Vous pouvez modifier vos abonnements à tout moment avec ce menu ou /feed unsubscribe.' });

        return interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
    }

    async executeSearch(interaction) {
        const query = interaction.options.getString('recherche');
        const guildId = interaction.guild?.id || 'default';

        const results = await this.service.searchItems(guildId, query, 5);
        if (!results || results.length === 0) {
            return interaction.reply({
                content: `🔍 Aucun article trouvé pour la recherche **"${query}"**.`,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🔍 Résultats de recherche : "${query}"`)
            .setDescription(
                results.map((r, i) => {
                    const dateStr = r.postedAt ? `<t:${Math.floor(r.postedAt / 1000)}:R>` : '';
                    return `**${i + 1}.** [${r.title || 'Sans titre'}](${r.url || '#'}) ${dateStr}\n*Source: ${r.feedName}*${r.author ? ` • @${r.author}` : ''}`;
                }).join('\n\n')
            )
            .setFooter({ text: `${results.length} résultat(s) affiché(s)` });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeStats(interaction) {
        const guildId = interaction.guild?.id || 'default';
        const stats = await this.service.getGuildStats(guildId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF7F)
            .setTitle('📊 Statistiques d\'Activité des Flux & Communauté')
            .addFields(
                { name: '📰 Flux Actifs', value: `${stats.activeFeeds} / ${stats.totalFeeds}`, inline: true },
                { name: '🔔 Abonnements Membres', value: `${stats.totalSubscriptions}`, inline: true },
                { name: '📋 Publications Envoyées', value: `${stats.totalPosts}`, inline: true },
                { name: '🔗 Clics sur Liens', value: `${stats.totalClicks}`, inline: true },
                { name: '🎁 Offres Réclamées', value: `${stats.totalClaims}`, inline: true },
                { name: '⭐ XP Distribué', value: `${stats.totalXpAwarded} XP`, inline: true }
            );

        if (stats.topTags && stats.topTags.length > 0) {
            embed.addFields({
                name: '🏷️ Top Tags les plus suivis',
                value: stats.topTags.map(t => `\`#${t.tag}\` (${t.count})`).join(', '),
                inline: false
            });
        }

        return interaction.reply({ embeds: [embed] });
    }

    async executeDigest(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const feedId = interaction.options.getString('id');
        const sent = await this.service.triggerDigest(feedId, interaction.client);

        if (sent) {
            return interaction.reply({ content: '📰 Digest généré et envoyé avec succès !', ephemeral: true });
        } else {
            return interaction.reply({ content: 'ℹ️ Aucun article en attente dans la file pour ce flux ou salon introuvable.', ephemeral: true });
        }
    }

    async executePurge(interaction) {
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) &&
            !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Réservé aux modérateurs/administrateurs.', ephemeral: true });
        }

        const feedId = interaction.options.getString('id') || null;
        await interaction.deferReply({ ephemeral: true });

        const result = await this.service.purgeExpired(feedId, interaction.client);
        return interaction.editReply({
            content: `🧹 **Nettoyage automatique terminé !**\n• Articles expirés marqués : **${result.expiredCount}**\n• Messages Discord supprimés : **${result.deletedMessagesCount}**`
        });
    }

    async executeAudio(interaction) {
        const feedId = interaction.options.getString('id');
        const limit = interaction.options.getInteger('nombre') || 5;

        await interaction.deferReply({ ephemeral: true });

        try {
            const briefing = await this.service.createAudioBriefing(feedId, limit);
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`🎙️ Bulletin Vocal : ${briefing.feedTitle}`)
                .setDescription(briefing.script.length > 2000 ? briefing.script.slice(0, 1997) + '...' : briefing.script)
                .setFooter({ text: `${briefing.itemCount} articles synthétisés • Fichier: ${briefing.filename}` });

            const files = [];
            if (briefing.buffer && briefing.buffer.length > 0) {
                files.push({
                    attachment: briefing.buffer,
                    name: briefing.filename
                });
            }

            return interaction.editReply({
                embeds: [embed],
                files,
                content: `📻 **Flash Audio généré avec succès !**`
            });
        } catch (err) {
            return interaction.editReply({
                content: `❌ Erreur lors de la génération du bulletin audio : ${err.message}`
            });
        }
    }

    async executeRead(interaction) {
        const url = interaction.options.getString('url');
        await interaction.deferReply({ ephemeral: true });

        try {
            const article = await this.service.getReaderArticle(url);
            const excerpt = article.textContent?.slice(0, 3500) || 'Contenu indisponible.';

            const embed = new EmbedBuilder()
                .setColor(0x00A8FC)
                .setTitle(article.title ? (article.title.length > 250 ? article.title.slice(0, 247) + '...' : article.title) : 'Mode Lecture')
                .setURL(article.url || url)
                .setDescription(excerpt)
                .setFooter({ text: `${article.siteName ? article.siteName + ' • ' : ''}Temps de lecture estimé : ~${article.readingTimeMinutes} min (${article.wordCount} mots)` });

            if (article.leadImageUrl) {
                embed.setThumbnail(article.leadImageUrl);
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Ouvrir l\'original')
                    .setStyle(ButtonStyle.Link)
                    .setURL(article.url || url)
            );

            return interaction.editReply({ embeds: [embed], components: [row] });
        } catch (err) {
            return interaction.editReply({
                content: `❌ Impossible d'extraire la version épurée de cet article : ${err.message}`
            });
        }
    }

    async executeBestOf(interaction) {
        const limit = interaction.options.getInteger('limite') || 5;
        const guildId = interaction.guild?.id || 'default';

        const items = await this.service.repo.getBestOfHistory(guildId, limit);

        if (!items || items.length === 0) {
            return interaction.reply({
                content: 'ℹ️ Aucun article n\'a encore atteint le palier Best-Of (Hall of Fame) sur ce serveur.',
                ephemeral: true
            });
        }

        const lines = items.map((it, idx) => {
            const date = it.posted_at ? new Date(it.posted_at).toLocaleDateString('fr-FR') : '';
            return `**#${idx + 1}** [${it.item_title || 'Article'}](${it.item_url})\n└ Flux: *${it.feedName || 'Inconnu'}* • Date: ${date}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🏆 Best-Of Actualités & Recommandations Communautaires')
            .setDescription(lines.join('\n\n'))
            .setFooter({ text: 'Les articles les plus plébiscités via les votes 👍' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async executeMyDigest(interaction) {
        const guildId = interaction.guild?.id || 'default';
        const userId = interaction.user.id;
        const timeInput = interaction.options.getString('heure');
        const enabledInput = interaction.options.getBoolean('actif');

        if (timeInput !== null || enabledInput !== null) {
            const time = timeInput || '08:00';
            const isEnabled = enabledInput !== null ? enabledInput : true;

            try {
                const updated = await this.service.setUserDigestSchedule(guildId, userId, time, isEnabled);
                return interaction.reply({
                    content: `🌅 **Mon Journal Privé configuré !**\n• Heure de réception en DM : **${updated.scheduleTime}** (UTC)\n• Statut : **${updated.isEnabled ? '🟢 Activé' : '🔴 Désactivé'}**\nVous recevrez un condensé IA de vos tags et flux abonnés directement en message privé.`,
                    ephemeral: true
                });
            } catch (err) {
                return interaction.reply({
                    content: `❌ Impossible de configurer le digest : ${err.message}`,
                    ephemeral: true
                });
            }
        }

        const current = await this.service.getUserDigestSchedule(guildId, userId);
        if (!current) {
            return interaction.reply({
                content: `ℹ️ Vous n'avez pas encore configuré votre Journal Privé matinal.\nUtilisez \`/feed my-digest heure:08:30 actif:true\` pour l'activer !`,
                ephemeral: true
            });
        }

        return interaction.reply({
            content: `🌅 **Votre Journal Privé actuel :**\n• Heure d'envoi en DM : **${current.scheduleTime}**\n• État : **${current.isEnabled ? '🟢 Activé' : '🔴 Désactivé'}**\n• Dernier envoi : ${current.lastSentAt ? new Date(current.lastSentAt).toLocaleString('fr-FR') : 'Jamais'}`,
            ephemeral: true
        });
    }

    async executeAsk(interaction) {
        const url = interaction.options.getString('url');
        const question = interaction.options.getString('question');

        await interaction.deferReply({ ephemeral: true });

        try {
            const res = await this.service.answerArticleQuestion({ url, question });
            return interaction.editReply({
                content: `📰 **Article :** [${res.title || url}](${url})\n💬 **Question :** *${question}*\n\n🤖 **Réponse de l'Assistant IA :**\n${res.answer}`
            });
        } catch (err) {
            return interaction.editReply({
                content: `❌ Impossible d'analyser l'article : ${err.message}`
            });
        }
    }

    async executeInvestigate(interaction) {
        const topic = interaction.options.getString('sujet');
        const limit = interaction.options.getInteger('limite') || 6;
        const guildId = interaction.guild?.id || 'default';

        await interaction.deferReply();

        try {
            const report = await this.service.investigateTopic({ guildId, topic, limit });
            const embed = this.service.investigationService.buildInvestigationEmbed(report);
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            return interaction.editReply({ content: `❌ Erreur lors de l'enquête : ${err.message}` });
        }
    }

    async executeTrivia(interaction) {
        const xpReward = interaction.options.getInteger('xp') || 50;
        const guildId = interaction.guild?.id || 'default';

        await interaction.deferReply();

        try {
            const quiz = await this.service.generateWeeklyTriviaQuiz({
                guildId,
                channelId: interaction.channelId,
                xpReward
            });

            const embed = this.service.triviaService.buildQuizEmbed(quiz);
            const row = this.service.triviaService.buildQuizActionRow(quiz.id);

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (err) {
            return interaction.editReply({ content: `❌ Impossible de lancer le quiz : ${err.message}` });
        }
    }

    async executeRemindMe(interaction) {
        const rawDate = interaction.options.getString('date');
        const title = interaction.options.getString('titre');
        const url = interaction.options.getString('url');
        const note = interaction.options.getString('note');
        const guildId = interaction.guild?.id || 'default';

        let releaseDate = this.service.reminderService?.detectReleaseDate(rawDate) || rawDate;

        try {
            await this.service.addReleaseReminder({
                guildId,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                releaseDate,
                reminderNote: note,
                itemTitle: title,
                itemUrl: url
            });

            return interaction.reply({
                content: `⏰ **Rappel programmé !** Vous recevrez une notification privée le **${releaseDate}** pour : *${title}*.`,
                ephemeral: true
            });
        } catch (err) {
            return interaction.reply({ content: `❌ Erreur : ${err.message}`, ephemeral: true });
        }
    }

    async executePredict(interaction) {
        const title = interaction.options.getString('titre');
        const rawOptions = interaction.options.getString('options') || 'OUI, NON';
        const guildId = interaction.guild?.id || 'default';

        const options = rawOptions.split(',').map(o => o.trim()).filter(Boolean);

        try {
            const market = await this.service.createPredictionMarket({
                guildId,
                channelId: interaction.channelId,
                title,
                options: options.length >= 2 ? options : ['OUI', 'NON'],
                createdBy: interaction.user.id
            });

            const embed = this.service.predictionService.buildPredictionEmbed(market);
            const row = this.service.predictionService.buildPredictionActionRow(market.id, market.options);

            return interaction.reply({
                embeds: [embed],
                components: [row]
            });
        } catch (err) {
            return interaction.reply({ content: `❌ Erreur création marché : ${err.message}`, ephemeral: true });
        }
    }

    // ==========================================
    // POINT D'ENTRÉE DU ROUTEUR COMMANDES
    // ==========================================

    async executeMain(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'add':              return this.executeAdd(interaction);
            case 'list':             return this.executeList(interaction);
            case 'menu':             return this.executeMenu(interaction);
            case 'streamers':        return this.executeStreamers(interaction);
            case 'presets':          return this.executePresets(interaction);
            case 'delete':           return this.executeDelete(interaction);
            case 'test':             return this.executeTest(interaction);
            case 'pause':            return this.executePause(interaction);
            case 'subscribe':        return this.executeSubscribe(interaction);
            case 'unsubscribe':      return this.executeUnsubscribe(interaction);
            case 'my-subscriptions': return this.executeMySubscriptions(interaction);
            case 'search':           return this.executeSearch(interaction);
            case 'stats':            return this.executeStats(interaction);
            case 'digest':           return this.executeDigest(interaction);
            case 'purge':            return this.executePurge(interaction);
            case 'audio':            return this.executeAudio(interaction);
            case 'read':             return this.executeRead(interaction);
            case 'bestof':           return this.executeBestOf(interaction);
            case 'my-digest':        return this.executeMyDigest(interaction);
            case 'ask':              return this.executeAsk(interaction);
            case 'investigate':      return this.executeInvestigate(interaction);
            case 'trivia':           return this.executeTrivia(interaction);
            case 'remind-me':        return this.executeRemindMe(interaction);
            case 'predict':          return this.executePredict(interaction);
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
    .setDescription('Flux RSS, alertes de streams et souscriptions')
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Ajouter un flux RSS, YouTube, Twitch, Kick ou actualités (Admin)')
            .addStringOption(o => o.setName('url').setDescription('URL du flux RSS, chaîne Twitch, Kick ou YouTube').setRequired(true))
            .addChannelOption(o => o.setName('salon').setDescription('Salon de publication').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName('nom').setDescription('Nom d\'affichage du flux').setRequired(false))
            .addStringOption(o => o.setName('categorie').setDescription('Catégorie (ex: gaming, stream, news, tech)').setRequired(false))
            .addStringOption(o => o.setName('tags').setDescription('Tags séparés par virgules (ex: live, twitch, deal)').setRequired(false))
            .addIntegerOption(o => o.setName('intervalle_minutes').setDescription('Intervalle de vérification en minutes').setRequired(false).setMinValue(2).setMaxValue(1440))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister tous les flux configurés sur le serveur')
    )
    .addSubcommand(sub =>
        sub.setName('menu')
            .setDescription('Afficher le menu déroulant interactif d\'abonnements aux flux')
    )
    .addSubcommand(sub =>
        sub.setName('streamers')
            .setDescription('Voir les streamers suivis et leur statut en direct')
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
        sub.setName('pause')
            .setDescription('Activer ou mettre en pause un flux (Admin)')
            .addStringOption(o => o.setName('id').setDescription('Identifiant du flux').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('subscribe')
            .setDescription('S\'abonner à un créateur, un tag, une catégorie ou un flux pour recevoir des alertes')
            .addStringOption(o => o.setName('compte').setDescription('Compte / créateur à suivre (ex: @PlayStation, zerator)').setRequired(false))
            .addStringOption(o => o.setName('tag').setDescription('Tag à suivre (ex: live, epic, steam, free)').setRequired(false))
            .addStringOption(o => o.setName('categorie').setDescription('Catégorie à suivre (ex: gaming, deals, news)').setRequired(false))
            .addStringOption(o => o.setName('mot_cle').setDescription('Mot-clé spécifique dans le titre ou texte').setRequired(false))
            .addStringOption(o => o.setName('flux_id').setDescription('Identifiant d\'un flux spécifique').setRequired(false))
            .addStringOption(o => o.setName('mode').setDescription('Mode de réception de la notification').setRequired(false).addChoices(
                { name: '📢 Mention dans le salon', value: 'mention' },
                { name: '📩 Message Privé (DM)', value: 'dm' },
                { name: '🔔 Salon + DM', value: 'both' },
                { name: '🏷️ Attribution du rôle dédié', value: 'role' }
            ))
    )
    .addSubcommand(sub =>
        sub.setName('unsubscribe')
            .setDescription('Se désabonner d\'un créateur, d\'un tag ou d\'un flux')
            .addStringOption(o => o.setName('compte').setDescription('Compte / créateur à retirer').setRequired(false))
            .addStringOption(o => o.setName('tag').setDescription('Tag à retirer').setRequired(false))
            .addStringOption(o => o.setName('categorie').setDescription('Catégorie à retirer').setRequired(false))
            .addStringOption(o => o.setName('mot_cle').setDescription('Mot-clé à retirer').setRequired(false))
            .addStringOption(o => o.setName('flux_id').setDescription('Identifiant de flux à retirer').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('my-subscriptions')
            .setDescription('Afficher la liste de vos abonnements actifs sur ce serveur')
    )
    .addSubcommand(sub =>
        sub.setName('search')
            .setDescription('Rechercher un article ou bon plan dans l\'historique des flux')
            .addStringOption(o => o.setName('recherche').setDescription('Mots-clés de recherche').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('stats')
            .setDescription('Afficher les statistiques d\'activité et d\'engagement des flux')
    )
    .addSubcommand(sub =>
        sub.setName('digest')
            .setDescription('Forcer la génération et l\'envoi immédiat d\'un digest (Admin)')
            .addStringOption(o => o.setName('id').setDescription('Identifiant du flux').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('purge')
            .setDescription('Nettoyer les deals et articles expirés sur Discord (Admin)')
            .addStringOption(o => o.setName('id').setDescription('Identifiant du flux spécifique (optionnel)').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('audio')
            .setDescription('Générer un bulletin audio / radio flash TTS des dernières actualités')
            .addStringOption(o => o.setName('id').setDescription('Identifiant du flux').setRequired(true))
            .addIntegerOption(o => o.setName('nombre').setDescription('Nombre d\'articles à inclure (défaut: 5)').setRequired(false).setMinValue(1).setMaxValue(15))
    )
    .addSubcommand(sub =>
        sub.setName('read')
            .setDescription('Afficher un article en mode lecture épuré sans publicité')
            .addStringOption(o => o.setName('url').setDescription('URL de la page web ou article').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('bestof')
            .setDescription('Afficher les articles Best-Of plébiscités par la communauté')
            .addIntegerOption(o => o.setName('limite').setDescription('Nombre d\'articles (défaut: 5)').setRequired(false).setMinValue(1).setMaxValue(20))
    )
    .addSubcommand(sub =>
        sub.setName('my-digest')
            .setDescription('Planifier ou consulter votre Journal Privé matinal reçu en message privé (DM)')
            .addStringOption(o => o.setName('heure').setDescription('Heure de réception quotidienne au format HH:mm (ex: 08:00)').setRequired(false))
            .addBooleanOption(o => o.setName('actif').setDescription('Activer ou désactiver la réception du journal').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('ask')
            .setDescription('Poser une question spécifique à l\'IA sur un article')
            .addStringOption(o => o.setName('url').setDescription('URL de l\'article').setRequired(true))
            .addStringOption(o => o.setName('question').setDescription('Votre question').setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName('investigate')
            .setDescription('Méta-enquête IA et frise chronologique multi-sources sur un sujet')
            .addStringOption(o => o.setName('sujet').setDescription('Sujet, jeu ou personnalité à enquêter').setRequired(true))
            .addIntegerOption(o => o.setName('limite').setDescription('Nombre d\'articles à analyser (défaut: 6)').setRequired(false).setMinValue(2).setMaxValue(20))
    )
    .addSubcommand(sub =>
        sub.setName('trivia')
            .setDescription('Lancer le Quiz d\'actualités de la semaine (QCM interactif avec gains d\'XP)')
            .addIntegerOption(o => o.setName('xp').setDescription('Montant d\'XP à remporter (défaut: 50)').setRequired(false).setMinValue(10).setMaxValue(200))
    )
    .addSubcommand(sub =>
        sub.setName('remind-me')
            .setDescription('Programmer un rappel personnel en DM pour une date de sortie officielle')
            .addStringOption(o => o.setName('titre').setDescription('Nom du jeu ou de l\'événement').setRequired(true))
            .addStringOption(o => o.setName('date').setDescription('Date de sortie au format AAAA-MM-JJ ou JJ/MM/AAAA').setRequired(true))
            .addStringOption(o => o.setName('url').setDescription('Lien vers la source ou le jeu').setRequired(false))
            .addStringOption(o => o.setName('note').setDescription('Note ou commentaire personnel').setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName('predict')
            .setDescription('Créer un marché de prédiction et ouvrir les paris communautaires en XP')
            .addStringOption(o => o.setName('titre').setDescription('Question ou affirmation à parier (ex: GTA 6 sortira-t-il en 2026 ?)').setRequired(true))
            .addStringOption(o => o.setName('options').setDescription('Options séparées par des virgules (ex: OUI, NON)').setRequired(false))
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
        sub.setName('menu')
            .setDescription('Afficher le menu déroulant interactif d\'abonnements aux flux')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Supprimer un flux')
            .addStringOption(o => o.setName('id').setDescription('ID du flux').setRequired(true))
    );

Command({ name: 'feed', builder: feedBuilder })(AutofeedCommands.prototype, 'executeMain');
Command({ name: 'autofeed', builder: autofeedBuilder })(AutofeedCommands.prototype, 'executeMain');

module.exports = { AutofeedCommands };
