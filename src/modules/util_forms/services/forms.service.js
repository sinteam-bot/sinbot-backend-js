/**
 * src/modules/util_forms/services/forms.service.js
 *
 * Service métier pour les formulaires personnalisés (Phase 14 G21).
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');
const { FormsRepository } = require('./forms.repository.js');
const logger = require('../../../utils/logger.js');

class FormsService {
    static inject = [FormsRepository];

    constructor(repo) {
        this.repo = repo;
    }

    async createForm({ guildId, name, title, description, channelId, questions }) {
        if (!guildId || !name || !title || !channelId) {
            return { ok: false, error: 'Paramètres obligatoires manquants (nom, titre, salon).' };
        }

        const existing = await this.repo.getFormByName(guildId, name);
        if (existing) {
            return { ok: false, error: `Un formulaire nommé "${name}" existe déjà.` };
        }

        const created = await this.repo.createForm({
            guildId,
            name,
            title,
            description,
            channelId,
            questions: questions || []
        });

        logger.info(`Formulaire "${name}" créé sur le serveur ${guildId}`, 'FORMS');
        return { ok: true, data: created };
    }

    async getForm(idOrName, guildId = null) {
        let form = await this.repo.getFormById(idOrName);
        if (!form && guildId) {
            form = await this.repo.getFormByName(guildId, idOrName);
        }
        return form;
    }

    async listForms(guildId) {
        return this.repo.listForms(guildId);
    }

    async deleteForm(id) {
        await this.repo.deleteForm(id);
        return { ok: true };
    }

    async submitForm({ formId, guildId, userId, answers, client = null }) {
        const form = await this.repo.getFormById(formId);
        if (!form) return { ok: false, error: 'Formulaire introuvable.' };

        const submission = await this.repo.submitForm({ formId, guildId, userId, answers });

        // Poster la réponse sur le salon cible
        if (client && client.channels && form.channelId) {
            try {
                const channel = client.channels.cache.get(form.channelId) || await client.channels.fetch(form.channelId).catch(() => null);
                if (channel && channel.send) {
                    const embed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle(`📝 Nouvelle réponse : ${form.title}`)
                        .setDescription(`Soumis par <@${userId}> (<t:${Math.floor(Date.now() / 1000)}:R>)`)
                        .setTimestamp();

                    for (const [q, a] of Object.entries(answers)) {
                        embed.addFields({ name: String(q).slice(0, 256), value: String(a || '_Non répondu_').slice(0, 1024), inline: false });
                    }

                    await channel.send({ embeds: [embed] }).catch(err => {
                        logger.warn(`Erreur envoi réponse form sur ${form.channelId}: ${err.message}`, 'FORMS');
                    });
                }
            } catch (err) {
                logger.warn(`Erreur notification Discord form: ${err.message}`, 'FORMS');
            }
        }

        return { ok: true, data: submission };
    }

    async listSubmissions(formId) {
        return this.repo.listSubmissions(formId);
    }
}

Injectable()(FormsService);

module.exports = { FormsService };
