/**
 * birthday.service.js — logique métier des anniversaires
 *
 * Pas de dépendance sur discord.js (sauf pour les types en JSDoc)
 * -> testable en isolation complète.
 *
 * Responsabilités :
 *   - getSettings / updateSettings
 *   - setBirthday (avec calcul cooldown Draftbot)
 *   - canChangeBirthday
 *   - removeBirthday
 *   - setVisibility
 *   - listToday / listUpcoming
 *   - renderTemplate (substitution variables)
 *   - nextBirthday (calcul date)
 */

const { Injectable } = require('../../../core/index.js');
const { BirthdayRepository } = require('./birthday.repository.js');

const DEFAULT_COOLDOWN_DAYS = {
    1: 1,
    2: 2,
    3: 180,
    4: 365
};

class BirthdayService {
    static inject = [BirthdayRepository];

    constructor(repo) {
        this.repo = repo;
    }

    // ============== SETTINGS ==============

    async getSettings(guildId) {
        const s = await this.repo.getSettings(guildId);
        const { getConfig } = require('../../../config/index.js');
        const yaml = getConfig().birthdays || {};

        const mode = s?.mode || yaml.mode || 'public';
        const announceChannelId = s?.announceChannelId !== undefined && s?.announceChannelId !== null ? s.announceChannelId : (yaml.announce?.channel_id || null);
        const announceHour = s?.announceHour ?? yaml.announce?.hour ?? 9;
        const announceTimezone = s?.announceTimezone || yaml.announce?.timezone || 'Europe/Paris';
        const pingRoleId = s?.pingRoleId !== undefined && s?.pingRoleId !== null ? s.pingRoleId : (yaml.announce?.ping_role_id || null);
        const messageTemplate = s?.messageTemplate || yaml.announce?.message_template || '🎂 Joyeux anniversaire {user} ! Tu fêtes tes **{age} ans** aujourd\'hui ! 🎉';
        const tempRoleId = s?.tempRoleId !== undefined && s?.tempRoleId !== null ? s.tempRoleId : (yaml.temp_role?.role_id || null);
        const enabled = s ? !!s.enabled : (yaml.enabled !== undefined ? !!yaml.enabled : false);
        const gifts = s?.gifts || yaml.gifts || { max_per_user: 2, xp_per_birthday: 500 };
        const cooldown = s?.cooldown || yaml.cooldown || { first_change_days: 1, second_change_days: 2, third_change_days: 180, default_change_days: 365 };

        return {
            guildId,
            mode,
            announceChannelId,
            announceHour,
            announceTimezone,
            pingRoleId,
            messageTemplate,
            tempRoleId,
            enabled,
            gifts,
            cooldown,
            announce: {
                channel_id: announceChannelId,
                hour: announceHour,
                timezone: announceTimezone,
                ping_role_id: pingRoleId,
                message_template: messageTemplate
            },
            temp_role: {
                enabled: !!tempRoleId,
                role_id: tempRoleId
            }
        };
    }

    async updateSettings(guildId, patch = {}) {
        const current = await this.getSettings(guildId);
        const announce = patch.announce || {};
        const tempRole = patch.temp_role || {};

        const announceChannelId = patch.announceChannelId !== undefined ? patch.announceChannelId : (announce.channel_id !== undefined ? announce.channel_id : current.announceChannelId);
        const announceHour = patch.announceHour !== undefined ? Number(patch.announceHour) : (announce.hour !== undefined ? Number(announce.hour) : current.announceHour);
        const announceTimezone = patch.announceTimezone || announce.timezone || current.announceTimezone || 'Europe/Paris';
        const pingRoleId = patch.pingRoleId !== undefined ? patch.pingRoleId : (announce.ping_role_id !== undefined ? announce.ping_role_id : current.pingRoleId);
        const messageTemplate = patch.messageTemplate || announce.message_template || current.messageTemplate;
        const tempRoleId = patch.tempRoleId !== undefined ? patch.tempRoleId : (tempRole.role_id !== undefined ? tempRole.role_id : current.tempRoleId);
        const mode = patch.mode || current.mode || 'public';
        const enabled = patch.enabled !== undefined ? !!patch.enabled : current.enabled;
        const gifts = { ...(current.gifts || {}), ...(patch.gifts || {}) };
        const cooldown = { ...(current.cooldown || {}), ...(patch.cooldown || {}) };

        const toSave = {
            guildId,
            mode,
            announceChannelId,
            announceHour,
            announceTimezone,
            pingRoleId,
            messageTemplate,
            tempRoleId,
            enabled,
            gifts,
            cooldown
        };

        await this.repo.upsertSettings(toSave);

        // Synchroniser également dans config.yml
        try {
            const { saveModuleConfig, getConfig } = require('../../../config/index.js');
            const conf = getConfig().birthdays || {};
            saveModuleConfig('birthdays', {
                ...conf,
                enabled,
                mode,
                announce: {
                    ...(conf.announce || {}),
                    channel_id: announceChannelId,
                    hour: announceHour,
                    timezone: announceTimezone,
                    ping_role_id: pingRoleId,
                    message_template: messageTemplate
                },
                temp_role: {
                    ...(conf.temp_role || {}),
                    enabled: !!tempRoleId,
                    role_id: tempRoleId
                },
                gifts,
                cooldown
            });
        } catch (e) {
            console.warn(`[BirthdayService] Synchro config.yml: ${e.message}`);
        }

        return this.getSettings(guildId);
    }

    // ============== USER OPERATIONS ==============

    /**
     * Définit l'anniversaire d'un user, avec gestion du cooldown
     * @returns {Promise<{ok: boolean, error?: string, nextChangeAt?: number}>}
     */
    async setBirthday({ userId, username, guildId, birthdate }) {
        if (!userId || !username || !birthdate) {
            return { ok: false, error: 'missing_params' };
        }
        const validation = this._validateBirthdate(birthdate);
        if (!validation.ok) return { ok: false, error: validation.error };
        const normalized = validation.normalized;

        const settings = await this.getSettings(guildId);
        const scopeGuildId = settings.mode === 'private' ? guildId : null;

        const cooldown = await this.canChangeBirthday(userId, scopeGuildId);
        if (!cooldown.allowed) {
            return { ok: false, error: 'cooldown', nextChangeAt: cooldown.nextChangeAt };
        }

        // Met à jour user_birthdays (table legacy globale)
        const { schema } = require('../../../db/index.js');
        const { db } = require('../../../db/index.js');
        const { sql } = require('drizzle-orm');
        try {
            await db.insert(schema.userBirthdays)
                .values({
                    userId,
                    username,
                    birthdate: normalized,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .onConflictDoUpdate({
                    target: schema.userBirthdays.userId,
                    set: {
                        username,
                        birthdate: normalized,
                        updatedAt: sql`CURRENT_TIMESTAMP`
                    }
                });
        } catch (e) {
            return { ok: false, error: 'db_error' };
        }

        // Log le changement pour le cooldown
        const previous = await this.repo.getLastChange(userId, scopeGuildId);
        const prevBirthdate = previous?.new_birthdate || null;
        const changeNumber = (await this.repo.getChangeCount(userId, scopeGuildId)) + 1;
        const cooldownDays = DEFAULT_COOLDOWN_DAYS[changeNumber] || DEFAULT_COOLDOWN_DAYS[4];
        const cooldownUntil = Date.now() + cooldownDays * 86400_000;
        await this.repo.insertChange({
            userId,
            guildId: scopeGuildId,
            changeNumber,
            previousBirthdate: prevBirthdate,
            newBirthdate: normalized,
            cooldownUntil
        });

        return { ok: true, birthdate: normalized, nextChangeAt: cooldownUntil };
    }

    /**
     * Vérifie si l'user peut modifier son anniversaire
     */
    async canChangeBirthday(userId, guildId = null) {
        const last = await this.repo.getLastChange(userId, guildId);
        if (!last) return { allowed: true };
        if (last.cooldown_until <= Date.now()) return { allowed: true };
        return { allowed: false, nextChangeAt: last.cooldown_until };
    }

    async getBirthday(userId, guildId = null) {
        const { schema } = require('../../../db/index.js');
        const { db } = require('../../../db/index.js');
        const { eq } = require('drizzle-orm');
        const res = await db.select()
            .from(schema.userBirthdays)
            .where(eq(schema.userBirthdays.userId, userId))
            .limit(1);
        if (!res[0]) return null;
        return {
            userId: res[0].userId,
            username: res[0].username,
            birthdate: res[0].birthdate,
            visibility: await this._isVisible(userId, guildId)
        };
    }

    async removeBirthday(userId, guildId = null) {
        const { schema } = require('../../../db/index.js');
        const { db } = require('../../../db/index.js');
        const { eq } = require('drizzle-orm');
        await db.delete(schema.userBirthdays)
            .where(eq(schema.userBirthdays.userId, userId));
        return { ok: true };
    }

    async setVisibility(userId, guildId, enabled) {
        return this.repo.upsertVisibility(userId, guildId, !!enabled);
    }

    async getVisibility(userId, guildId) {
        const v = await this.repo.getVisibility(userId, guildId);
        if (v) return v.enabled;
        return null;
    }

    async _isVisible(userId, guildId) {
        if (!guildId) return true;
        const v = await this.getVisibility(userId, guildId);
        return v === null ? true : !!v;
    }

    // ============== LISTS ==============

    /**
     * Liste les anniversaires du jour pour un guild
     * (filtre par visibilité)
     */
    async listToday(guildId) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const all = await this.repo.listTodaysBirthdays(guildId, month, day);
        // Filtre par visibilité
        return all.filter(u => u.visibility !== false);
    }

    /**
     * Liste les anniversaires des N prochains jours
     */
    async listUpcoming(guildId, days = 365) {
        const { schema } = require('../../../db/index.js');
        const { db } = require('../../../db/index.js');
        const { isNotNull } = require('drizzle-orm');
        const res = await db.select()
            .from(schema.userBirthdays)
            .where(isNotNull(schema.userBirthdays.birthdate));

        const today = new Date();
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const currentYear = today.getFullYear();
        const out = [];

        for (const row of res) {
            if (!row.birthdate) continue;
            const parsed = this._parseBirthdateParts(row.birthdate);
            if (!parsed) continue;

            const bMonth = parsed.month - 1; // 0-indexed for Date
            const bDay = parsed.day;
            const bYear = parsed.year;

            let next = new Date(currentYear, bMonth, bDay);
            if (next < todayMidnight) {
                next = new Date(currentYear + 1, bMonth, bDay);
            }

            const diffDays = Math.round((next.getTime() - todayMidnight.getTime()) / 86400_000);
            if (diffDays >= 0 && diffDays <= days) {
                const visible = await this._isVisible(row.userId, guildId);
                if (visible) {
                    const nextYear = next.getFullYear();
                    const age = bYear ? (nextYear - bYear) : null;
                    const dateFormatted = `${String(bDay).padStart(2, '0')}/${String(bMonth + 1).padStart(2, '0')}${bYear ? '/' + bYear : ''}`;

                    out.push({
                        userId: row.userId,
                        user_id: row.userId,
                        username: row.username,
                        birthdate: row.birthdate,
                        age,
                        days_until: diffDays,
                        daysLeft: diffDays,
                        dateFormatted,
                        nextDate: next.toISOString()
                    });
                }
            }
        }
        return out.sort((a, b) => a.days_until - b.days_until);
    }

    // ============== HISTORY ==============

    async recordAnnouncement({ guildId, userId, username, age, messageId, giftsGiven }) {
        return this.repo.insertHistory({ guildId, userId, username, age, messageId, giftsGiven });
    }

    async listHistory(args) {
        return this.repo.listHistory(args);
    }

    // ============== UTILS ==============

    /**
     * Découpe et extrait jour, mois, année d'une chaîne birthdate
     */
    _parseBirthdateParts(input) {
        if (!input) return null;
        const s = String(input).trim();
        const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (iso) {
            return { year: parseInt(iso[1], 10), month: parseInt(iso[2], 10), day: parseInt(iso[3], 10) };
        }
        const parts = s.split(/[-/]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10), day: parseInt(parts[2], 10) };
            } else {
                return { day: parseInt(parts[0], 10), month: parseInt(parts[1], 10), year: parseInt(parts[2], 10) };
            }
        } else if (parts.length === 2) {
            return { year: null, month: parseInt(parts[1], 10), day: parseInt(parts[0], 10) };
        }
        return null;
    }

    /**
     * Valide et normalise une date d'anniversaire
     * Accepte : YYYY-MM-DD, DD/MM, DD-MM, MM/DD
     * Retourne : string YYYY-MM-DD
     */
    _validateBirthdate(input) {
        if (!input) return { ok: false, error: 'empty' };
        const s = String(input).trim();

        // ISO YYYY-MM-DD
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
            const [y, m, d] = s.split('-').map(Number);
            if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, error: 'invalid_date' };
            return { ok: true, normalized: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
        }

        // DD/MM ou DD-MM (format européen)
        const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
        if (slash) {
            const d = parseInt(slash[1], 10);
            const m = parseInt(slash[2], 10);
            if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, error: 'invalid_date' };
            const y = new Date().getFullYear();
            return { ok: true, normalized: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
        }

        return { ok: false, error: 'invalid_format' };
    }

    /**
     * Calcule le prochain anniversaire à partir d'une birthdate ISO
     */
    nextBirthday(birthdate, fromDate = new Date()) {
        if (!birthdate) return null;
        const parsed = this._parseBirthdateParts(birthdate);
        if (!parsed) return null;
        const bMonth = parsed.month - 1;
        const bDay = parsed.day;
        const fromMidnight = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
        let next = new Date(fromDate.getFullYear(), bMonth, bDay);
        if (next < fromMidnight) next = new Date(fromDate.getFullYear() + 1, bMonth, bDay);
        return next;
    }

    /**
     * Calcule l'âge à une date donnée
     */
    ageAt(birthdate, atDate = new Date()) {
        if (!birthdate) return null;
        const parsed = this._parseBirthdateParts(birthdate);
        if (!parsed || !parsed.year) return null;
        let age = atDate.getFullYear() - parsed.year;
        const m = (atDate.getMonth() + 1) - parsed.month;
        if (m < 0 || (m === 0 && atDate.getDate() < parsed.day)) age--;
        return age;
    }

    /**
     * Rend le template avec les variables Draftbot
     */
    renderTemplate(template, vars) {
        if (!template) return '';
        return String(template)
            .replace(/\{user\}/g, vars.userId ? `<@${vars.userId}>` : '')
            .replace(/\{username\}/g, vars.username || 'Utilisateur')
            .replace(/\{age\}/g, String(vars.age ?? '?'))
            .replace(/\{role\}/g, vars.roleId ? `<@&${vars.roleId}>` : '')
            .replace(/\{gifts\}/g, vars.gifts || 'Aucun cadeau');
    }
}

Injectable()(BirthdayService);

module.exports = { BirthdayService, DEFAULT_COOLDOWN_DAYS };
