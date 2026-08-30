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
        let yaml = {};
        try {
            const { getFeatureConfig } = require('../../../config/c12-loader.js');
            yaml = await getFeatureConfig(guildId || 'default', 'birthdays');
        } catch {
            const { getConfig } = require('../../../config/index.js');
            yaml = getConfig().birthdays || {};
        }

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

        // Synchroniser également dans data/{guildId}/birthdays.config.yml
        try {
            const { setFeatureConfig, getFeatureConfig } = require('../../../config/c12-loader.js');
            const conf = await getFeatureConfig(guildId, 'birthdays');
            await setFeatureConfig(guildId, 'birthdays', {
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
            console.warn('[BirthdayService] Impossible de mettre à jour le fichier YAML de config:', e.message);
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

        // S'assurer que l'anniversaire est visible sur le serveur d'enregistrement
        if (guildId) {
            await this.setVisibility(userId, guildId, true);
        }

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
        const currentYear = new Date().getFullYear();

        // ISO YYYY-MM-DD
        const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (iso) {
            const y = parseInt(iso[1], 10);
            return {
                year: y < currentYear ? y : null,
                month: parseInt(iso[2], 10),
                day: parseInt(iso[3], 10)
            };
        }

        // Format ISO sans année --MM-DD ou MM-DD
        const noYearIso = s.match(/^--?(\d{1,2})-(\d{1,2})$/);
        if (noYearIso) {
            return { year: null, month: parseInt(noYearIso[1], 10), day: parseInt(noYearIso[2], 10) };
        }

        const parts = s.split(/[-/]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                const y = parseInt(parts[0], 10);
                return { year: y < currentYear ? y : null, month: parseInt(parts[1], 10), day: parseInt(parts[2], 10) };
            } else {
                const y = parseInt(parts[2], 10);
                return { day: parseInt(parts[0], 10), month: parseInt(parts[1], 10), year: y < currentYear ? y : null };
            }
        } else if (parts.length === 2) {
            // DD/MM européen
            return { year: null, month: parseInt(parts[1], 10), day: parseInt(parts[0], 10) };
        }
        return null;
    }

    /**
     * Valide et normalise une date d'anniversaire
     * Accepte : YYYY-MM-DD, DD/MM/YYYY, DD/MM, DD-MM, MM-DD, JJMM
     * Retourne : string ISO (YYYY-MM-DD ou --MM-DD)
     */
    _validateBirthdate(input) {
        if (!input) return { ok: false, error: 'empty' };
        const s = String(input).trim();

        // ISO YYYY-MM-DD
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
            const [y, m, d] = s.split('-').map(Number);
            if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, error: 'invalid_date' };
            const currentYear = new Date().getFullYear();
            if (y >= currentYear) {
                return { ok: true, normalized: `--${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
            }
            return { ok: true, normalized: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
        }

        // DD/MM/YYYY ou DD-MM-YYYY (format européen avec année)
        const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmy) {
            const d = parseInt(dmy[1], 10);
            const m = parseInt(dmy[2], 10);
            const y = parseInt(dmy[3], 10);
            if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, error: 'invalid_date' };
            const currentYear = new Date().getFullYear();
            if (y >= currentYear) {
                return { ok: true, normalized: `--${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
            }
            return { ok: true, normalized: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
        }

        // DD/MM ou DD-MM (format européen sans année)
        const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
        if (slash) {
            const d = parseInt(slash[1], 10);
            const m = parseInt(slash[2], 10);
            if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, error: 'invalid_date' };
            return { ok: true, normalized: `--${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
        }

        // 4 chiffres compacts JJMM (ex: 0109 pour 1er Septembre, 0901)
        const digits4 = s.match(/^(\d{2})(\d{2})$/);
        if (digits4) {
            let d = parseInt(digits4[1], 10);
            let m = parseInt(digits4[2], 10);
            if (m < 1 || m > 12) {
                if (d >= 1 && d <= 12 && m >= 1 && m <= 31) {
                    const temp = d;
                    d = m;
                    m = temp;
                }
            }
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                return { ok: true, normalized: `--${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
            }
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
        const currentYear = atDate.getFullYear();
        if (parsed.year >= currentYear) return null;

        let age = currentYear - parsed.year;
        const m = (atDate.getMonth() + 1) - parsed.month;
        if (m < 0 || (m === 0 && atDate.getDate() < parsed.day)) age--;
        if (age <= 0) return null;
        return age;
    }

    /**
     * Rend le template avec les variables Draftbot et Twig/Liquid {% if age %}
     */
    renderTemplate(template, vars) {
        if (!template) return '';
        const templateEngine = require('../../../utils/templateEngine.js');
        let rendered = template;
        try {
            rendered = templateEngine.render(template, vars);
        } catch {
            rendered = template;
        }

        // Nettoyer les reliquats d'âge si pas d'âge fourni
        if (!vars.age || vars.age <= 0) {
            rendered = String(rendered)
                .replace(/Tu fêtes tes \*\*(\?|\{age\}|0)\s*ans\*\*\s*aujourd'hui\s*!\s*/gi, '')
                .replace(/Tu as \*\*(\?|\{age\}|0)\s*ans\*\*\s*!\s*/gi, '');
        }

        return String(rendered)
            .replace(/\{user\}/g, vars.userId ? `<@${vars.userId}>` : (vars.user || ''))
            .replace(/\{username\}/g, vars.username || 'Utilisateur')
            .replace(/\{age\}/g, vars.age && vars.age > 0 ? String(vars.age) : '')
            .replace(/\{role\}/g, vars.roleId ? `<@&${vars.roleId}>` : '')
            .replace(/\{gifts\}/g, vars.gifts || 'Aucun cadeau')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }
}

Injectable()(BirthdayService);

module.exports = { BirthdayService, DEFAULT_COOLDOWN_DAYS };
