/**
 * Utilitaires sécurisés pour la manipulation et le formatage des dates
 * Évite les TypeError (ex: time.toISOString is not a function) en gérant
 * de façon robuste les objets Date, timestamps numériques et chaînes ISO.
 */

/**
 * Convertit de manière sécurisée une valeur (Date, timestamp numérique, chaîne) en chaîne ISO 8601.
 * 
 * @param {Date|string|number|null|undefined} val - Valeur à convertir
 * @param {string|null} [fallback=null] - Valeur de repli si val est invalide ou nulle
 * @returns {string|null} Chaîne ISO (ex: "2026-08-24T12:00:00.000Z") ou fallback
 */
function toISOStringSafe(val, fallback = null) {
    if (val === null || val === undefined) {
        return fallback;
    }

    if (val instanceof Date) {
        return !isNaN(val.getTime()) ? val.toISOString() : fallback;
    }

    if (typeof val === 'number') {
        const d = new Date(val);
        return !isNaN(d.getTime()) ? d.toISOString() : fallback;
    }

    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return fallback;
        
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
            return d.toISOString();
        }
        // Si la chaîne ne peut pas être parsée comme date valide mais n'est pas vide
        return fallback !== null ? fallback : trimmed;
    }

    // Objet avec getter .toISOString ou .toDate
    if (typeof val?.toISOString === 'function') {
        try {
            return val.toISOString();
        } catch {
            return fallback;
        }
    }

    return fallback;
}

/**
 * Convertit de façon sécurisée en objet Date valide.
 * 
 * @param {Date|string|number|null|undefined} val
 * @param {Date|null} [fallback=null]
 * @returns {Date|null}
 */
function toDateSafe(val, fallback = null) {
    if (val === null || val === undefined) return fallback;
    if (val instanceof Date) return !isNaN(val.getTime()) ? val : fallback;
    
    try {
        const d = new Date(val);
        return !isNaN(d.getTime()) ? d : fallback;
    } catch {
        return fallback;
    }
}

/**
 * Retourne l'heure courante (0-23) au fuseau horaire de Paris.
 * 
 * @param {Date|string|number} [date=new Date()]
 * @returns {number}
 */
function getParisHour(date = new Date()) {
    try {
        const d = toDateSafe(date, new Date());
        const formatter = new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'Europe/Paris',
            hour: 'numeric',
            hour12: false
        });
        return parseInt(formatter.format(d), 10);
    } catch {
        return (date instanceof Date ? date : new Date()).getHours();
    }
}

/**
 * Retourne la date au format YYYY-MM-DD selon le fuseau horaire de Paris.
 * 
 * @param {Date|string|number} [date=new Date()]
 * @returns {string}
 */
function getParisDateString(date = new Date()) {
    try {
        const d = toDateSafe(date, new Date());
        const formatter = new Intl.DateTimeFormat('fr-CA', {
            timeZone: 'Europe/Paris',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        return formatter.format(d);
    } catch {
        const d = toDateSafe(date, new Date());
        return d.toISOString().slice(0, 10);
    }
}

module.exports = {
    toISOStringSafe,
    toDateSafe,
    getParisHour,
    getParisDateString
};
