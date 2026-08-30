/**
 * src/core/i18n.js
 *
 * Moteur d'internationalisation (i18n) multi-langues (FR, EN, ES) - Phase 14 G34.
 */

const { db } = require('../db/index.js');

const DICTIONARIES = {
    fr: {
        common: {
            success: 'Succès',
            error: 'Erreur',
            permission_denied: '❌ Permission refusée.',
            user_not_found: '❌ Utilisateur introuvable.',
            channel_not_found: '❌ Salon introuvable.'
        },
        economy: {
            daily_success: '✅ Tu as reçu **{{reward}}** 🪙 ! Solde : **{{balance}}**',
            work_success: '💼 {{job}} et tu as gagné **{{reward}}** 🪙 ! Solde : **{{balance}}**',
            cooldown_daily: '❌ Tu as déjà claim aujourd\'hui. Réessaie {{time}}.',
            cooldown_work: '⏳ Tu es fatigué ! Reviens travailler {{time}}.'
        },
        moderation: {
            warn_success: '⚠️ Le membre {{user}} a été averti pour : {{reason}}.',
            kick_success: '👢 Le membre {{user}} a été expulsé.',
            ban_success: '🔨 Le membre {{user}} a été banni.'
        },
        language: {
            current: '🌐 La langue actuelle de ce serveur est : **{{lang}}**',
            updated: '✅ Langue du serveur changée en : **{{lang}}**'
        }
    },
    en: {
        common: {
            success: 'Success',
            error: 'Error',
            permission_denied: '❌ Permission denied.',
            user_not_found: '❌ User not found.',
            channel_not_found: '❌ Channel not found.'
        },
        economy: {
            daily_success: '✅ You received **{{reward}}** 🪙! Balance: **{{balance}}**',
            work_success: '💼 {{job}} and you earned **{{reward}}** 🪙! Balance: **{{balance}}**',
            cooldown_daily: '❌ You already claimed today. Try again {{time}}.',
            cooldown_work: '⏳ You are tired! Come back to work {{time}}.'
        },
        moderation: {
            warn_success: '⚠️ Member {{user}} has been warned for: {{reason}}.',
            kick_success: '👢 Member {{user}} has been kicked.',
            ban_success: '🔨 Member {{user}} has been banned.'
        },
        language: {
            current: '🌐 Current server language is: **{{lang}}**',
            updated: '✅ Server language updated to: **{{lang}}**'
        }
    },
    es: {
        common: {
            success: 'Éxito',
            error: 'Error',
            permission_denied: '❌ Permiso denegado.',
            user_not_found: '❌ Usuario no encontrado.',
            channel_not_found: '❌ Canal no encontrado.'
        },
        economy: {
            daily_success: '✅ ¡Has recibido **{{reward}}** 🪙! Saldo: **{{balance}}**',
            work_success: '💼 {{job}} y ganaste **{{reward}}** 🪙! Saldo: **{{balance}}**',
            cooldown_daily: '❌ Ya has reclamado hoy. Vuelve a intentarlo {{time}}.',
            cooldown_work: '⏳ ¡Estás cansado! Vuelve a trabajar {{time}}.'
        },
        moderation: {
            warn_success: '⚠️ El miembro {{user}} ha sido advertido por: {{reason}}.',
            kick_success: '👢 El miembro {{user}} ha sido expulsado.',
            ban_success: '🔨 El miembro {{user}} ha sido baneado.'
        },
        language: {
            current: '🌐 El idioma actual de este servidor es: **{{lang}}**',
            updated: '✅ Idioma del servidor actualizado a: **{{lang}}**'
        }
    }
};

const _guildCache = new Map();

class I18nManager {
    static SUPPORTED_LOCALES = ['fr', 'en', 'es'];

    async getGuildLanguage(guildId) {
        if (!guildId) return 'fr';
        if (_guildCache.has(guildId)) return _guildCache.get(guildId);

        try {
            const res = await db.pool.query(`SELECT language FROM guild_languages WHERE guild_id = $1 LIMIT 1`, [guildId]);
            const lang = res.rows?.[0]?.language || 'fr';
            _guildCache.set(guildId, lang);
            return lang;
        } catch {
            return 'fr';
        }
    }

    async setGuildLanguage(guildId, lang) {
        if (!guildId) return false;
        const normalized = (lang || 'fr').toLowerCase();
        const validLang = I18nManager.SUPPORTED_LOCALES.includes(normalized) ? normalized : 'fr';
        const now = Date.now();

        await db.pool.query(
            `INSERT INTO guild_languages (guild_id, language, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (guild_id) DO UPDATE SET language = EXCLUDED.language, updated_at = EXCLUDED.updated_at`,
            [guildId, validLang, now]
        );

        _guildCache.set(guildId, validLang);
        return validLang;
    }

    t(key, localeOrGuildId = 'fr', vars = {}) {
        let locale = 'fr';
        if (typeof localeOrGuildId === 'string') {
            if (I18nManager.SUPPORTED_LOCALES.includes(localeOrGuildId.toLowerCase())) {
                locale = localeOrGuildId.toLowerCase();
            } else if (_guildCache.has(localeOrGuildId)) {
                locale = _guildCache.get(localeOrGuildId);
            }
        }

        const dict = DICTIONARIES[locale] || DICTIONARIES.fr;
        const parts = key.split('.');
        let val = dict;
        for (const p of parts) {
            val = val?.[p];
            if (val === undefined) break;
        }

        if (val === undefined) {
            // Fallback FR
            let fallback = DICTIONARIES.fr;
            for (const p of parts) {
                fallback = fallback?.[p];
                if (fallback === undefined) break;
            }
            val = fallback !== undefined ? fallback : key;
        }

        if (typeof val !== 'string') return key;

        // Interpolation
        return val.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`));
    }
}

const i18n = new I18nManager();

module.exports = { i18n, I18nManager, DICTIONARIES };
