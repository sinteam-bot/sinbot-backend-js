// Configuration du prompt for daily message
// Connecté au système de configuration unifié (config.yml / variables d'environnement)
const { getConfig } = require('./index.js');
const { toDateSafe } = require('../utils/dateUtils.js');

const DEFAULT_ANGLE_HUMOUR = [
    "observation du quotidien",
    "energie du matin",
    "bienveillance complice"
];
const DEFAULT_STYLE_ECRITURE = [
    "philosophique",
    "familier chaleureux"
];
const DEFAULT_DISPOSITIF_NARRATIF = [
    "classique"
];
const DEFAULT_CONTRAINTE_LEGERE = [
    "interdire_les_mots: soleil",
    "pas_de_point_dexclamation",
    "utiliser_une_image_concrete",
    "aucune_reference_au_temps",
    "aucun_pronom_personnel"
];
const DEFAULT_AJOUT_MOD = [
    "Petit déjeuner", " boisson", " matin", " réconfortant", " motivation",
    " avec du pep’s", " le lever", " le lit", " doudou", " boire", " bol",
    " tasse", " verre", " coucher", " ambition", " sérénité", " tendresse",
    " chaleur", " café", " thé", " chocolat chaud", " confiance", " opportunité",
    " fraicheur", " oreiller", " couette", " cuisine", " tartine", " jus d’orange",
    " amour", " gorgée"
];

function getAiConfig() {
    const full = getConfig();
    return full.daily_message?.ai_config || {};
}

function getAngleHumour() {
    return getAiConfig().angle_humour || DEFAULT_ANGLE_HUMOUR;
}

function getStyleEcriture() {
    return getAiConfig().style_ecriture || DEFAULT_STYLE_ECRITURE;
}

function getDispositifNarratif() {
    return getAiConfig().dispositif_narratif || DEFAULT_DISPOSITIF_NARRATIF;
}

function getContrainteLegere() {
    return getAiConfig().contrainte_legere || DEFAULT_CONTRAINTE_LEGERE;
}

function getAjoutMod() {
    return getAiConfig().ajoutMod || DEFAULT_AJOUT_MOD;
}

function pickRandom(arr, n) {
    return [...arr]
        .sort(() => Math.random() - 0.5)
        .slice(0, n);
}

function getDayOfYear(date = new Date()) {
    const d = toDateSafe(date, new Date());
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = d - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

function pickDeterministic(array, seed) {
    return array[seed % array.length];
}

function getDailyVariation(date = new Date()) {
    const day = getDayOfYear(date);

    return {
        angle: pickDeterministic(getAngleHumour(), day),
        style: pickDeterministic(getStyleEcriture(), day + 3),
        dispositif: pickDeterministic(getDispositifNarratif(), day + 7),
        contrainte: pickDeterministic(getContrainteLegere(), day * 2)
    };
}

function buildPrompt(date = new Date()) {
    const d = toDateSafe(date, new Date());
    const { angle, style, dispositif, contrainte } = getDailyVariation(d);
    const dateStr = d.toISOString().slice(0, 10);
    const aiConf = getAiConfig();

    const customPromptTemplate = aiConf.prompt;
    const customInstruction = aiConf.instruction || "Écris uniquement le message final. Commence les message par 'En ce ' suivi de la date du jour (exemple format : lundi 1 janvier 2025). Le message doit être clair et compréhensible de tous. Maximum 3 phrases sans emoji.";

    let promptText = `Date : ${dateStr}. Objectif : souhaiter une bonne journée en ambiance petit déjeuner. Voici les mots à inclure dans le texte : ${pickRandom(getAjoutMod(), 2).join(', ')}`;
    if (customPromptTemplate) {
        promptText = customPromptTemplate
            .replace(/\${dateStr}/g, dateStr)
            .replace(/\${pickRandom\(ajoutMod,\s*\d+\)}/g, pickRandom(getAjoutMod(), 2).join(', '));
    }

    return {
        prompt: promptText,
        instruction: customInstruction
    };
}

function requestPrompt(date = new Date()) {
    const d = toDateSafe(date, new Date());
    const dayName = d.toLocaleDateString('fr-FR', { weekday: 'long' });
    const day = d.getDate();
    const monthName = d.toLocaleDateString('fr-FR', { month: 'long' });
    const year = d.getFullYear();
    const fullDate = `${dayName} ${day} ${monthName} ${year}`;

    const generateprompt = `Tu es un générateur de prompts créatifs pour messages Discord.

  Ta mission est de produire UNIQUEMENT un prompt unique et original qui servira à générer un message de "bonne journée".
  Ne génère PAS le message final, uniquement le prompt.

  Contraintes pour le prompt à générer:
  - Le prompt doit être en français
  - Il doit donner une direction claire et créative (ton, style, thème, ambiance)
  - Il doit varier chaque jour (humour, inspiration, saison, événements, etc.)
  - Il doit inclure des éléments concrets pour inspirer l'IA

  Le prompt généré doit obligatoirement imposer que:
  - Le message final commence par "En ce ${fullDate}"
  - Le message final fait entre 1 et 3 phrases maximum
  - Le message final ne contient pas d'emoji
  - Le message final est clair et positif

  Exemples de prompts à générer (ne copie pas ces exemples, invente des nouveaux):
  - "Rédige un message de bonne journée sur un ton philosophique inspiré par le calme d'un matin pluvieux, en commençant par 'En ce ${fullDate}'."
  - "Écris un message de bonne journée avec un ton motivant façon coach, en utilisant une métaphore liée au café, et commence par 'En ce ${fullDate}'."
  - "Crée un message de bonne journée poétique évoquant la lumière du matin, en 2 phrases maximum, en commençant par 'En ce ${fullDate}'."

  Important: Retourne UNIQUEMENT le texte du prompt, sans explication ni commentaire.`;

    return generateprompt;
}

/**
 * Génère un prompt final formaté avec la date du jour
 * @param {string} rawPrompt - Le prompt généré par l'IA
 * @param {Date|string|number} date - Date à utiliser
 * @returns {object} - {prompt: string, instruction: string}
 */
function formatFinalPrompt(rawPrompt, date = new Date()) {
    const d = toDateSafe(date, new Date());
    const dayName = d.toLocaleDateString('fr-FR', { weekday: 'long' });
    const day = d.getDate();
    const monthName = d.toLocaleDateString('fr-FR', { month: 'long' });
    const year = d.getFullYear();
    const fullDate = `${dayName} ${day} ${monthName} ${year}`;

    return {
        prompt: rawPrompt,
        instruction: `Écris UNIQUEMENT le message final. Commence obligatoirement par "En ce ${fullDate}". 
                  Le message doit faire 1 à 3 phrases maximum, être clair, positif et sans emoji.
                  Respecte exactement les contraintes du prompt fourni.`
    };
}

function getHumour() {
    return getAngleHumour().toString();
}
function getEcriture() {
    return getStyleEcriture().toString();
}
function getNarratif() {
    return getDispositifNarratif().toString();
}
function getContrainte() {
    return getContrainteLegere().toString();
}

module.exports = {
    buildPrompt,
    requestPrompt,
    formatFinalPrompt,
    getHumour,
    getEcriture,
    getNarratif,
    getContrainte
};