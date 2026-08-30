/**
 * src/modules/community_modmail/services/modmail.service.js
 *
 * Service métier pour ModMail (Module P3).
 */

const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { ModMailRepository } = require('./modmail.repository.js');
const logger = require('../../../utils/logger.js');

class ModMailService {
    static inject = [ModMailRepository];

    constructor(repo) {
        this.repo = repo;
    }

    async handleUserDM(message, client, config = {}) {
        if (!message || message.author?.bot || !client) return;

        const guildId = config.guild_id || process.env.GUILD_ID;
        if (!guildId) return;

        const isBanned = await this.repo.isUserBanned(guildId, message.author.id);
        if (isBanned) {
            return;
        }

        let thread = await this.repo.getActiveThreadByUser(guildId, message.author.id);
        let isNewThread = false;

        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;

        // Création du salon staff si nécessaire
        if (!thread) {
            try {
                const cleanName = `mail-${message.author.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user'}`;
                const permissionOverwrites = [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    }
                ];

                if (config.staff_roles && Array.isArray(config.staff_roles)) {
                    for (const roleId of config.staff_roles) {
                        permissionOverwrites.push({
                            id: roleId,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                        });
                    }
                }

                const channel = await guild.channels.create({
                    name: cleanName,
                    type: ChannelType.GuildText,
                    parent: config.category_id || null,
                    topic: `ModMail pour <@${message.author.id}> (\`${message.author.id}\`)`,
                    permissionOverwrites
                });

                thread = await this.repo.createThread({
                    guildId,
                    userId: message.author.id,
                    channelId: channel.id
                });
                isNewThread = true;

                // Message d'en-tête pour le staff
                const headerEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`📬 Nouveau ModMail : ${message.author.tag}`)
                    .setDescription(`**Membre :** <@${message.author.id}> (\`${message.author.id}\`)\n**Compte créé le :** <t:${Math.floor(message.author.createdTimestamp / 1000)}:D>`)
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: 'Utilisez /reply ou /areply pour répondre.' });

                await channel.send({ embeds: [headerEmbed] });

                // Accusé de réception à l'utilisateur
                const greeting = config.greeting_message || '👋 Bonjour ! Votre message a bien été reçu par l’équipe de modération.';
                await message.author.send(greeting).catch(() => {});
            } catch (err) {
                logger.warn(`Erreur création salon ModMail: ${err.message}`, 'MODMAIL');
                return;
            }
        }

        // Relais du message au staff
        try {
            const staffChan = guild.channels.cache.get(thread.channelId) || await guild.channels.fetch(thread.channelId).catch(() => null);
            if (staffChan && staffChan.send) {
                const userEmbed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                    .setDescription(message.content || '*[Message sans texte]*')
                    .setTimestamp();

                if (message.attachments && message.attachments.size > 0) {
                    const firstAtt = message.attachments.first();
                    if (firstAtt?.url) {
                        userEmbed.setImage(firstAtt.url);
                    }
                }

                await staffChan.send({ embeds: [userEmbed] });

                await this.repo.addMessage({
                    threadId: thread.id,
                    senderType: 'user',
                    senderId: message.author.id,
                    senderName: message.author.tag,
                    content: message.content || '[Fichier]'
                });
            }
        } catch (err) {
            logger.warn(`Erreur relais ModMail DM -> Staff: ${err.message}`, 'MODMAIL');
        }
    }

    async replyToUser({ channelId, staffUser, content, imageUrl = null, isAnonymous = false, client, config = {} }) {
        if (!channelId || !content || !client) {
            return { ok: false, error: 'Paramètres manquants.' };
        }

        const thread = await this.repo.getThreadByChannel(channelId);
        if (!thread) {
            return { ok: false, error: 'Aucun fil ModMail actif associé à ce salon.' };
        }

        const targetUser = await client.users.fetch(thread.userId).catch(() => null);
        if (!targetUser) {
            return { ok: false, error: 'Impossible de joindre l\'utilisateur Discord.' };
        }

        // Envoi au membre
        const senderName = isAnonymous ? (config.anonymous_name || 'Staff de Serveur') : (staffUser.displayName || staffUser.username);
        const dmEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({ name: senderName, iconURL: isAnonymous ? client.user.displayAvatarURL() : staffUser.displayAvatarURL?.() })
            .setDescription(content)
            .setTimestamp();

        if (imageUrl) {
            dmEmbed.setImage(imageUrl);
        }

        try {
            await targetUser.send({ embeds: [dmEmbed] });
        } catch (err) {
            return { ok: false, error: `Impossible d'envoyer le message privé (DMs bloqués ou fermés : ${err.message}).` };
        }

        // Confirmation dans le salon staff
        const staffChan = client.channels.cache.get(channelId);
        if (staffChan && staffChan.send) {
            const confirmEmbed = new EmbedBuilder()
                .setColor(0xEB459E)
                .setAuthor({ name: `${staffUser.username} (${isAnonymous ? 'Anonyme' : 'Public'})`, iconURL: staffUser.displayAvatarURL?.() })
                .setDescription(content)
                .setTimestamp();

            if (imageUrl) confirmEmbed.setImage(imageUrl);
            await staffChan.send({ embeds: [confirmEmbed] });
        }

        await this.repo.addMessage({
            threadId: thread.id,
            senderType: 'staff',
            senderId: staffUser.id || 'staff',
            senderName: staffUser.username || 'Staff',
            content,
            isAnonymous
        });

        logger.info(`Réponse ModMail envoyée à ${targetUser.tag} par ${staffUser.username} (anon: ${isAnonymous})`, 'MODMAIL');
        return { ok: true };
    }

    async closeThread({ channelId, closedBy, reason = 'Problème résolu', client, config = {} }) {
        const thread = await this.repo.getThreadByChannel(channelId);
        if (!thread) {
            return { ok: false, error: 'Aucun fil ModMail actif associé à ce salon.' };
        }

        // Notification de fermeture au membre
        if (client) {
            const targetUser = await client.users.fetch(thread.userId).catch(() => null);
            if (targetUser) {
                const closeMsg = config.closing_message || '🔒 Ce fil d’assistance ModMail a été clôturé.';
                const closeEmbed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('🔒 ModMail Clôturé')
                    .setDescription(`${closeMsg}\n**Raison :** ${reason}`)
                    .setTimestamp();

                await targetUser.send({ embeds: [closeEmbed] }).catch(() => {});
            }
        }

        await this.repo.closeThread(thread.id, typeof closedBy === 'string' ? closedBy : closedBy.username, reason);

        // Suppression du salon Discord si présent
        if (client) {
            const staffChan = client.channels.cache.get(channelId);
            if (staffChan && staffChan.delete) {
                await staffChan.delete(`ModMail fermé: ${reason}`).catch(() => {});
            }
        }

        logger.info(`ModMail thread ${thread.id} clôturé par ${closedBy.username || closedBy}`, 'MODMAIL');
        return { ok: true };
    }

    // =================== BANS ===================

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

    async listBans(guildId) {
        return this.repo.listBans(guildId);
    }

    // =================== SNIPPETS ===================

    async setSnippet({ guildId, name, content, createdBy }) {
        return this.repo.setSnippet({ guildId, name, content, createdBy });
    }

    async getSnippet(guildId, name) {
        return this.repo.getSnippet(guildId, name);
    }

    async listSnippets(guildId) {
        return this.repo.listSnippets(guildId);
    }

    async deleteSnippet(guildId, name) {
        await this.repo.deleteSnippet(guildId, name);
        return { ok: true };
    }

    async listThreads(guildId, status = null, limit = 50) {
        return this.repo.listThreads(guildId, status, limit);
    }

    async getThreadMessages(threadId) {
        return this.repo.getThreadMessages(threadId);
    }
}

Injectable()(ModMailService);

module.exports = { ModMailService };
