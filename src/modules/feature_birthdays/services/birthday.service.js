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
        if (s) return s;
        return {
            guildId,
            mode: 'public',
            announceChannelId: null,
            announceHour: 9,
            announceTimezone: 'Europe/Paris',
            pingRoleId: null,
            messageTemplate: '🎂 Joyeux anniversaire {user} ! Tu fêtes tes **{age} ans** aujourdhui ! 🎉',
            tempRoleId: null,
            enabled: true
        };
    }

    async updateSettings(guildId, patch) {
        const current = await this.getSettings(guildId);
        const merged = { ...current, ...patch, guildId };
        return this.repo.upsertSettings(merged);
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
    async listUpcoming(guildId, days = 7) {
        // Pour V1, on s'appuie sur la table legacy user_birthdays
        // et on calcule en JS pour être multi-dialecte.
        const { schema } = require('../../../db/index.js');
        const { db } = require('../../../db/index.js');
        const { eq, isNotNull } = require('drizzle-orm');
        const res = await db.select()
            .from(schema.userBirthdays)
            .where(isNotNull(schema.userBirthdays.birthdate));

        const today = new Date();
        const currentYear = today.getFullYear();
        const out = [];
        for (const row of res) {
            const bDate = new Date(row.birthdate);
            if (isNaN(bDate.getTime())) continue;
            let next = new Date(currentYear, bDate.getMonth(), bDate.getDate());
            if (next < today) next = new Date(currentYear + 1, bDate.getMonth(), bDate.getDate());
            const diffDays = Math.ceil((next - today) / 86400_000);
            if (diffDays >= 0 && diffDays <= days) {
                // Filtre visibilité si on a l'info
                const visible = await this._isVisible(row.userId, guildId);
                if (visible) {
                    out.push({
                        userId: row.userId,
                        username: row.username,
                        birthdate: row.birthdate,
                        age: currentYear - bDate.getFullYear(),
                        days_until: diffDays
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
        const bDate = new Date(birthdate);
        if (isNaN(bDate.getTime())) return null;
        let next = new Date(fromDate.getFullYear(), bDate.getMonth(), bDate.getDate());
        if (next < fromDate) next = new Date(fromDate.getFullYear() + 1, bDate.getMonth(), bDate.getDate());
        return next;
    }

    /**
     * Calcule l'âge à une date donnée
     */
    ageAt(birthdate, atDate = new Date()) {
        if (!birthdate) return null;
        const bDate = new Date(birthdate);
        if (isNaN(bDate.getTime())) return null;
        let age = atDate.getFullYear() - bDate.getFullYear();
        const m = atDate.getMonth() - bDate.getMonth();
        if (m < 0 || (m === 0 && atDate.getDate() < bDate.getDate())) age--;
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
