/**
 * src/modules/community_confessions/services/confessions.service.js
 *
 * Service métier pour les confessions anonymes et la modération (Module P1).
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { ConfessionsRepository } = require('./confessions.repository.js');
const logger = require('../../../utils/logger.js');

class ConfessionsService {
    static inject = [ConfessionsRepository];

    constructor(repo) {
        this.repo = repo;
    }

    buildPublicEmbed(confession, parentConfession = null, config = {}) {
        const color = config.color || '#FF69B4';
        const colorInt = parseInt(color.replace('#', ''), 16) || 0xFF69B4;

        const title = parentConfession
            ? `💬 Réponse #${confession.number} (à la Confession #${parentConfession.number})`
            : `💬 Confession #${confession.number}`;

        const embed = new EmbedBuilder()
            .setColor(colorInt)
            .setTitle(title)
            .setDescription(confession.content)
            .setFooter({ text: 'Utilise /confess pour poster une confession anonyme' })
            .setTimestamp(new Date(confession.createdAt));

        if (confession.imageUrl) {
            embed.setImage(confession.imageUrl);
        }

        return embed;
    }

    buildReviewEmbed(confession, parentConfession = null) {
        const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle(`🔍 [REVUE] Confession #${confession.number}`)
            .setDescription(`**Contenu :**\n${confession.content}`)
            .addFields(
                { name: '👤 Auteur (audit interne)', value: `<@${confession.authorId}> (\`${confession.authorId}\`)`, inline: true },
                { name: '🆔 ID Unique', value: `\`${confession.id}\``, inline: true }
            )
            .setTimestamp();

        if (parentConfession) {
            embed.addFields({ name: '↩️ Réponse à', value: `Confession #${parentConfession.number}`, inline: true });
        }
        if (confession.imageUrl) {
            embed.setImage(confession.imageUrl);
        }

        return embed;
    }

    async submitConfession({ guildId, authorId, content, imageUrl = null, parentNumber = null, config = {}, client = null }) {
        if (!guildId || !authorId || !content) {
            return { ok: false, error: 'Paramètres obligatoires manquants.' };
        }

        // 1. Vérification ban
        const isBanned = await this.repo.isUserBanned(guildId, authorId);
        if (isBanned) {
            return { ok: false, error: '🚫 Tu as été banni de l\'envoi de confessions sur ce serveur.' };
        }

        // 2. Vérification mots bloqués
        const blockedWords = config.blocked_words || [];
        const contentLower = content.toLowerCase();
        for (const w of blockedWords) {
            if (w && contentLower.includes(w.toLowerCase())) {
                return { ok: false, error: `❌ Ta confession contient un terme non autorisé ("${w}").` };
            }
        }

        // 3. Parent confession si /reply
        let parentConfession = null;
        if (parentNumber) {
            parentConfession = await this.repo.getConfessionByNumber(guildId, parentNumber);
            if (!parentConfession || parentConfession.status !== 'published') {
                return { ok: false, error: `❌ La confession #${parentNumber} est introuvable ou non publiée.` };
            }
        }

        const requireApproval = Boolean(config.require_approval && config.review_channel_id);
        const status = requireApproval ? 'pending' : 'published';

        const created = await this.repo.createConfession({
            guildId,
            authorId,
            content,
            imageUrl,
            status,
            channelId: config.channel_id || null,
            parentConfessionId: parentConfession ? parentConfession.id : null
        });

        // 4. Si mode review activé
        if (requireApproval && client && client.channels) {
            try {
                const reviewChan = client.channels.cache.get(config.review_channel_id) || await client.channels.fetch(config.review_channel_id).catch(() => null);
                if (reviewChan && reviewChan.send) {
                    const reviewEmbed = this.buildReviewEmbed(created, parentConfession);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`confession:approve:${created.id}`)
                            .setLabel('Approuver')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅'),
                        new ButtonBuilder()
                            .setCustomId(`confession:reject:${created.id}`)
                            .setLabel('Rejeter')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌')
                    );

                    const reviewMsg = await reviewChan.send({ embeds: [reviewEmbed], components: [row] });
                    await this.repo.updateConfession(created.id, { reviewMessageId: reviewMsg.id });
                }
            } catch (err) {
                logger.warn(`Erreur envoi review confession: ${err.message}`, 'CONFESSIONS');
            }

            return {
                ok: true,
                status: 'pending',
                data: created,
                message: `✅ Ta confession #${created.number} a été envoyée aux modérateurs pour validation.`
            };
        }

        // 5. Publication instantanée
        if (config.channel_id && client && client.channels) {
            try {
                const pubChan = client.channels.cache.get(config.channel_id) || await client.channels.fetch(config.channel_id).catch(() => null);
                if (pubChan && pubChan.send) {
                    const pubEmbed = this.buildPublicEmbed(created, parentConfession, config);
                    const pubMsg = await pubChan.send({ embeds: [pubEmbed] });
                    await this.repo.updateConfession(created.id, { messageId: pubMsg.id });
                }
            } catch (err) {
                logger.warn(`Erreur publication directe confession: ${err.message}`, 'CONFESSIONS');
            }
        }

        logger.info(`Confession #${created.number} publiée sur ${guildId}`, 'CONFESSIONS');
        return {
            ok: true,
            status: 'published',
            data: created,
            message: `✅ Ta confession #${created.number} a été publiée anonymement !`
        };
    }

    async approveConfession(id, reviewerId, config = {}, client = null) {
        const confession = await this.repo.getConfessionById(id);
        if (!confession) return { ok: false, error: 'Confession introuvable.' };
        if (confession.status === 'published') return { ok: false, error: 'Cette confession est déjà publiée.' };

        let parentConfession = null;
        if (confession.parentConfessionId) {
            parentConfession = await this.repo.getConfessionById(confession.parentConfessionId);
        }

        const channelId = config.channel_id || confession.channelId;
        let publicMessageId = null;

        // Publication sur le salon public
        if (channelId && client && client.channels) {
            try {
                const pubChan = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
                if (pubChan && pubChan.send) {
                    const pubEmbed = this.buildPublicEmbed(confession, parentConfession, config);
                    const pubMsg = await pubChan.send({ embeds: [pubEmbed] });
                    publicMessageId = pubMsg.id;
                }
            } catch (err) {
                logger.warn(`Erreur publication confession approuvée: ${err.message}`, 'CONFESSIONS');
            }
        }

        const updated = await this.repo.updateConfession(id, {
            status: 'published',
            channelId,
            messageId: publicMessageId
        });

        // Mise à jour du message de review
        if (confession.reviewMessageId && config.review_channel_id && client && client.channels) {
            try {
                const reviewChan = client.channels.cache.get(config.review_channel_id) || await client.channels.fetch(config.review_channel_id).catch(() => null);
                if (reviewChan && reviewChan.messages) {
                    const reviewMsg = await reviewChan.messages.fetch(confession.reviewMessageId).catch(() => null);
                    if (reviewMsg && reviewMsg.edit) {
                        const approvedEmbed = this.buildReviewEmbed(confession, parentConfession)
                            .setColor(0x57F287)
                            .setFooter({ text: `✅ Approuvée par ${reviewerId}` });
                        await reviewMsg.edit({ embeds: [approvedEmbed], components: [] });
                    }
                }
            } catch (_) {}
        }

        logger.info(`Confession #${confession.number} approuvée par ${reviewerId}`, 'CONFESSIONS');
        return { ok: true, data: updated };
    }

    async rejectConfession(id, reviewerId, config = {}, client = null) {
        const confession = await this.repo.getConfessionById(id);
        if (!confession) return { ok: false, error: 'Confession introuvable.' };

        const updated = await this.repo.updateConfession(id, { status: 'rejected' });

        // Mise à jour du message de review
        if (confession.reviewMessageId && config.review_channel_id && client && client.channels) {
            try {
                const reviewChan = client.channels.cache.get(config.review_channel_id) || await client.channels.fetch(config.review_channel_id).catch(() => null);
                if (reviewChan && reviewChan.messages) {
                    const reviewMsg = await reviewChan.messages.fetch(confession.reviewMessageId).catch(() => null);
                    if (reviewMsg && reviewMsg.edit) {
                        const rejectedEmbed = this.buildReviewEmbed(confession)
                            .setColor(0xED4245)
                            .setFooter({ text: `❌ Rejetée par ${reviewerId}` });
                        await reviewMsg.edit({ embeds: [rejectedEmbed], components: [] });
                    }
                }
            } catch (_) {}
        }

        logger.info(`Confession #${confession.number} rejetée par ${reviewerId}`, 'CONFESSIONS');
        return { ok: true, data: updated };
    }

    async banUser(guildId, userId, reason, bannedBy) {
        return this.repo.banUser(guildId, userId, reason, bannedBy);
    }

    async unbanUser(guildId, userId) {
        await this.repo.unbanUser(guildId, userId);
        return { ok: true };
    }

    async isUserBanned(guildId, userId) {
        return this.repo.isUserBanned(guildId, userId);
    }

    async listConfessions(guildId, status = null, limit = 50) {
        return this.repo.listConfessions(guildId, status, limit);
    }

    async listBans(guildId) {
        return this.repo.listBans(guildId);
    }
}

Injectable()(ConfessionsService);

module.exports = { ConfessionsService };
