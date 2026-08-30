/**
 * src/modules/automation_autothread/services/autothread.service.js
 *
 * Service métier pour la création et gestion automatique de threads Discord (Module P2).
 */

const { Injectable } = require('../../../core/index.js');
const { AutoThreadRepository } = require('./autothread.repository.js');
const logger = require('../../../utils/logger.js');

class AutoThreadService {
    static inject = [AutoThreadRepository];

    constructor(repo) {
        this.repo = repo;
    }

    formatThreadTitle(titleFormat, message) {
        const format = titleFormat || '{author} - {message}';
        const authorName = message.member?.displayName || message.author?.username || 'Membre';
        const username = message.author?.username || 'Membre';
        const tag = message.author?.tag || username;
        
        let contentSnippet = (message.content || '').trim().replace(/\n+/g, ' ');
        if (!contentSnippet && message.attachments && message.attachments.size > 0) {
            contentSnippet = 'Fichier partagé';
        }
        if (!contentSnippet) {
            contentSnippet = 'Nouveau fil';
        }

        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

        let title = format
            .replace(/{author}/gi, authorName)
            .replace(/{username}/gi, username)
            .replace(/{tag}/gi, tag)
            .replace(/{message}/gi, contentSnippet)
            .replace(/{date}/gi, dateStr)
            .trim();

        if (title.length > 100) {
            title = title.slice(0, 97) + '...';
        }

        return title || 'Discussion';
    }

    async handleMessage(message) {
        if (!message || message.author?.bot || !message.guild || message.channel?.isThread?.()) {
            return;
        }

        const guildId = message.guild.id;
        const channelId = message.channel.id;

        const config = await this.repo.getChannel(guildId, channelId);
        if (!config || !config.enabled) return;

        try {
            const title = this.formatThreadTitle(config.titleFormat, message);

            if (!message.startThread) return;

            const thread = await message.startThread({
                name: title,
                autoArchiveDuration: 1440, // 24h
                reason: 'Auto-Thread automatique'
            });

            // Enregistrement en BDD
            await this.repo.saveThread({
                guildId,
                parentChannelId: channelId,
                threadId: thread.id,
                starterMessageId: message.id,
                authorId: message.author.id
            });

            // Slowmode
            if (config.slowmodeSeconds > 0 && thread.setRateLimitPerUser) {
                await thread.setRateLimitPerUser(config.slowmodeSeconds).catch(() => {});
            }

            // Auto-pin
            if (config.autoPin && message.pin) {
                await message.pin().catch(() => {});
            }

            // Message d'introduction
            if (config.introMessage && thread.send) {
                const formattedIntro = config.introMessage
                    .replace(/{author}/gi, `<@${message.author.id}>`)
                    .replace(/{thread}/gi, `<#${thread.id}>`);
                await thread.send(formattedIntro).catch(() => {});
            }

            logger.info(`Auto-Thread créé sur #${message.channel.name || channelId} : "${title}"`, 'AUTOTHREAD');
            return thread;
        } catch (err) {
            logger.warn(`Erreur création auto-thread ${channelId}: ${err.message}`, 'AUTOTHREAD');
        }
    }

    async renameThread(thread, newName, userId, isStaff = false) {
        if (!thread || !thread.isThread?.()) {
            return { ok: false, error: 'Cette commande doit être exécutée dans un fil de discussion (Thread).' };
        }

        const record = await this.repo.getThread(thread.id);
        const isAuthor = record ? record.authorId === userId : thread.ownerId === userId;

        if (!isAuthor && !isStaff) {
            return { ok: false, error: '❌ Seul l\'auteur du fil ou un modérateur peut renommer ce fil.' };
        }

        const cleanName = newName.trim().slice(0, 100);
        if (!cleanName) {
            return { ok: false, error: '❌ Titre invalide.' };
        }

        await thread.setName(cleanName);
        return { ok: true, name: cleanName };
    }

    async closeThread(thread, userId, isStaff = false, reason = 'Fermé par l\'utilisateur') {
        if (!thread || !thread.isThread?.()) {
            return { ok: false, error: 'Cette commande doit être exécutée dans un fil de discussion (Thread).' };
        }

        const record = await this.repo.getThread(thread.id);
        const isAuthor = record ? record.authorId === userId : thread.ownerId === userId;

        if (!isAuthor && !isStaff) {
            return { ok: false, error: '❌ Seul l\'auteur du fil ou un modérateur peut fermer ce fil.' };
        }

        await thread.setArchived(true, reason);
        return { ok: true };
    }

    async lockThread(thread, isStaff = false, reason = 'Verrouillé par la modération') {
        if (!thread || !thread.isThread?.()) {
            return { ok: false, error: 'Cette commande doit être exécutée dans un fil de discussion (Thread).' };
        }

        if (!isStaff) {
            return { ok: false, error: '❌ Réservé aux modérateurs.' };
        }

        await thread.setLocked(true, reason);
        await thread.setArchived(true, reason);
        return { ok: true };
    }

    // =================== CONFIGURATION ===================

    async setChannel(data) {
        return this.repo.setChannel(data);
    }

    async getChannel(guildId, channelId) {
        return this.repo.getChannel(guildId, channelId);
    }

    async listChannels(guildId) {
        return this.repo.listChannels(guildId);
    }

    async removeChannel(guildId, channelId) {
        await this.repo.removeChannel(guildId, channelId);
        return { ok: true };
    }
}

Injectable()(AutoThreadService);

module.exports = { AutoThreadService };
