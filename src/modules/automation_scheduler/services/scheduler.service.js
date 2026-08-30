/**
 * src/modules/automation_scheduler/services/scheduler.service.js
 *
 * Service métier pour les messages programmés, ponctuels, récurrents et templates rotatifs (P6).
 */

const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const { Injectable, getConfig } = require('../../../core/index.js');
const { SchedulerRepository } = require('./scheduler.repository.js');
const { parseCommandTags } = require('../../../utils/commandTagParser.js');
const logger = require('../../../utils/logger.js');

class SchedulerService {
    static inject = [SchedulerRepository];

    constructor(repo) {
        this.repo = repo;
        this._intervalTimer = null;
    }

    getConfig() {
        const full = getConfig();
        const conf = full.features?.scheduler || full.scheduler || {};
        return {
            enabled: conf.enabled !== false,
            check_interval_seconds: conf.check_interval_seconds || 30,
            max_messages_per_guild: conf.max_messages_per_guild || 50,
            ...conf
        };
    }

    computeNextRun({ cron: cronExpr, intervalMinutes, fromTimestamp = Date.now(), isOneTime = false }) {
        if (isOneTime) return fromTimestamp;

        if (intervalMinutes && intervalMinutes > 0) {
            return fromTimestamp + (intervalMinutes * 60 * 1000);
        }

        if (cronExpr) {
            return fromTimestamp + (60 * 60 * 1000);
        }

        return fromTimestamp + (60 * 60 * 1000);
    }

    async createScheduledMessage({
        guildId,
        name,
        channelId,
        content,
        embed,
        cron: cronExpr,
        intervalMinutes,
        timezone = 'Europe/Paris',
        autoClean = false,
        templateId = null,
        isOneTime = false,
        runAtTimestamp = null,
        createdBy
    }) {
        if (!guildId || !name || !channelId) {
            return { ok: false, error: 'Paramètres obligatoires manquants (guildId, name, channelId)' };
        }
        if (!content && !embed && !templateId) {
            return { ok: false, error: 'Un contenu textuel, un embed ou un modèle de template est requis.' };
        }

        if (cronExpr && !cron.validate(cronExpr)) {
            return { ok: false, error: `Expression cron invalide : "${cronExpr}"` };
        }

        const existing = await this.repo.getScheduledMessageByName(guildId, name);
        if (existing) {
            return { ok: false, error: `Un message programmé avec le nom "${name}" existe déjà.` };
        }

        const nextRunAt = isOneTime && runAtTimestamp
            ? runAtTimestamp
            : this.computeNextRun({
                cron: cronExpr,
                intervalMinutes,
                fromTimestamp: Date.now(),
                isOneTime
            });

        const created = await this.repo.insertScheduledMessage({
            guildId,
            channelId,
            name,
            content,
            embedJson: embed,
            cronExpression: cronExpr,
            intervalMinutes,
            timezone,
            autoClean: Boolean(autoClean),
            templateId,
            isOneTime: Boolean(isOneTime),
            nextRunAt,
            createdBy
        });

        logger.info(`Message programmé "${name}" créé sur ${guildId} (prochaine exécution : ${new Date(nextRunAt).toISOString()})`, 'SCHEDULER');
        return { ok: true, data: created };
    }

    async list(guildId) {
        return this.repo.listScheduledMessages(guildId);
    }

    async get(id) {
        return this.repo.getScheduledMessage(id);
    }

    async toggle(id) {
        const item = await this.repo.getScheduledMessage(id);
        if (!item) return { ok: false, error: 'Message programmé introuvable' };

        const newEnabled = !item.enabled;
        const nextRunAt = newEnabled
            ? this.computeNextRun({ cron: item.cronExpression, intervalMinutes: item.intervalMinutes, fromTimestamp: Date.now(), isOneTime: item.isOneTime })
            : item.nextRunAt;

        const updated = await this.repo.updateScheduledMessage(id, {
            enabled: newEnabled ? 1 : 0,
            next_run_at: nextRunAt
        });

        return { ok: true, data: updated };
    }

    async delete(id) {
        await this.repo.deleteScheduledMessage(id);
        return { ok: true };
    }

    // =================== TEMPLATES ===================

    async createTemplate({ guildId, name, items = [] }) {
        return this.repo.createTemplate({ guildId, name, items });
    }

    async getTemplate(guildId, name) {
        return this.repo.getTemplate(guildId, name);
    }

    async listTemplates(guildId) {
        return this.repo.listTemplates(guildId);
    }

    async deleteTemplate(guildId, name) {
        await this.repo.deleteTemplate(guildId, name);
        return { ok: true };
    }

    async addTemplateItem(guildId, name, item) {
        const tmpl = await this.repo.getTemplate(guildId, name);
        if (!tmpl) {
            return this.repo.createTemplate({ guildId, name, items: [item] });
        }
        const updatedItems = [...tmpl.items, item];
        return this.repo.createTemplate({ guildId, name, items: updatedItems });
    }

    // =================== EXECUTION & AUTO-CLEAN ===================

    async checkAndRunDueMessages(client) {
        try {
            const now = Date.now();
            const dueMessages = await this.repo.listDueMessages(now);

            for (const item of dueMessages) {
                await this.executeScheduledMessage(item, client, now);
            }
        } catch (err) {
            logger.warn(`Erreur vérification scheduler: ${err.message}`, 'SCHEDULER');
        }
    }

    async executeScheduledMessage(item, client, now = Date.now()) {
        try {
            let sentMessageId = null;

            if (client && client.channels) {
                const channel = client.channels.cache.get(item.channelId) || await client.channels.fetch(item.channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    // 1. Auto-Clean : supprimer le message précédent si activé
                    if (item.autoClean && item.lastMessageId) {
                        try {
                            const oldMsg = await channel.messages.fetch(item.lastMessageId).catch(() => null);
                            if (oldMsg && typeof oldMsg.delete === 'function') {
                                await oldMsg.delete().catch(() => {});
                            }
                        } catch (_) {}
                    }

                    const context = {
                        guild: channel.guild,
                        channel,
                        args: []
                    };

                    const payload = {};

                    // 2. Vérifier s'il s'agit d'un template rotatif
                    if (item.templateId) {
                        const tmpl = await this.repo.getTemplate(item.guildId, item.templateId) || await this.repo.getTemplateById(item.templateId);
                        if (tmpl && tmpl.items && tmpl.items.length > 0) {
                            const currentItem = tmpl.items[tmpl.currentIndex % tmpl.items.length];
                            if (typeof currentItem === 'string') {
                                const parsed = await parseCommandTags(currentItem, context, { executeActions: false });
                                payload.content = parsed.text;
                            } else if (typeof currentItem === 'object') {
                                payload.embeds = [this._buildEmbed(currentItem, context)];
                            }

                            // Avancer l'index rotatif
                            await this.repo.updateTemplateIndex(tmpl.id, (tmpl.currentIndex + 1) % tmpl.items.length);
                        }
                    }

                    // 3. Contenu textuel standard
                    if (!payload.content && item.content) {
                        const parsed = await parseCommandTags(item.content, context, { executeActions: false });
                        if (parsed.text) payload.content = parsed.text;
                    }

                    // 4. Embed standard
                    if (!payload.embeds && item.embed) {
                        payload.embeds = [this._buildEmbed(item.embed, context)];
                    }

                    if (payload.content || payload.embeds?.length) {
                        const sent = await channel.send(payload);
                        if (sent && sent.id) sentMessageId = sent.id;
                        logger.info(`Message programmé "${item.name}" envoyé sur #${channel.name}`, 'SCHEDULER');
                    }
                }
            }

            // Si message ponctuel (One-time), désactiver
            if (item.isOneTime) {
                await this.repo.updateScheduledMessage(item.id, {
                    last_run_at: now,
                    last_message_id: sentMessageId || item.lastMessageId,
                    enabled: 0
                });
                return;
            }

            // Calculer la prochaine occurrence
            const nextRunAt = this.computeNextRun({
                cron: item.cronExpression,
                intervalMinutes: item.intervalMinutes,
                fromTimestamp: now
            });

            await this.repo.updateScheduledMessage(item.id, {
                last_run_at: now,
                last_message_id: sentMessageId || item.lastMessageId,
                next_run_at: nextRunAt
            });
        } catch (err) {
            logger.warn(`Erreur exécution message programmé ${item.id} (${item.name}): ${err.message}`, 'SCHEDULER');
        }
    }

    _buildEmbed(embedData, context) {
        const data = typeof embedData === 'string' ? JSON.parse(embedData) : embedData;
        const embed = new EmbedBuilder();
        if (data.title) embed.setTitle(data.title);
        if (data.description) embed.setDescription(data.description);
        if (data.color) embed.setColor(data.color);
        if (data.footer) embed.setFooter(typeof data.footer === 'object' ? data.footer : { text: data.footer });
        if (data.image) embed.setImage(data.image);
        if (data.thumbnail) embed.setThumbnail(data.thumbnail);
        return embed;
    }

    start(client) {
        if (this._intervalTimer) return;
        const conf = this.getConfig();
        const intervalMs = Math.max(conf.check_interval_seconds || 30, 5) * 1000;

        this._intervalTimer = setInterval(() => {
            this.checkAndRunDueMessages(client).catch(() => { });
        }, intervalMs);
    }

    stop() {
        if (this._intervalTimer) {
            clearInterval(this._intervalTimer);
            this._intervalTimer = null;
        }
    }
}

Injectable()(SchedulerService);

module.exports = { SchedulerService };
