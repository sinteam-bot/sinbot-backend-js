// Configuration du prompt for daily message
const ANGLE_HUMOUR = [
        "observation du quotidien",
        "energie du matin",
        "bienveillance complice"
    ];
const  STYLE_ECRITURE = [
        "philosophique",
        "familier chaleureux"
    ];
const DISPOSITIF_NARRATIF = [
        "classique"
    ];
 const CONTRAINTE_LEGERE = [
        "interdire_les_mots: soleil",
        "pas_de_point_dexclamation",
        "utiliser_une_image_concrete",
        "aucune_reference_au_temps",
        "aucun_pronom_personnel"
    ]

  const ajoutMod = ["Petit déjeuner"," boisson"," matin"," réconfortant"," motivation"," avec du pep’s"," le lever"," le lit"," doudou"," boire"," bol"," tasse"," verre"," coucher"," ambition"," sérénité"," tendresse"," chaleur"," café"," thé"," chocolat chaud"," confiance"," opportunité"," fraicheur"," oreiller"," couette"," cuisine"," tartine"," jus d’orange"," amour"," gorgée"]
function pickRandom(arr, n) {
  return [...arr]
    .sort(() => Math.random() - 0.5)
    .slice(0, n);
}
function getDayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function pickDeterministic(array, seed) {
  return array[seed % array.length];
}

function getDailyVariation(date = new Date()) {
  const day = getDayOfYear(date);

  return {
    angle: pickDeterministic(ANGLE_HUMOUR, day),
    style: pickDeterministic(STYLE_ECRITURE, day + 3),
    dispositif: pickDeterministic(DISPOSITIF_NARRATIF, day + 7),
    contrainte: pickDeterministic(CONTRAINTE_LEGERE, day * 2)
  };
}

function buildPrompt(date = new Date()) {
  const { angle, style, dispositif, contrainte } = getDailyVariation(date);
  const dateStr = date.toISOString().slice(0, 10);
  var retour  = {
    "prompt" : `Date : ${dateStr}. Objectif : souhaiter une bonne journée en ambiance petit déjeuner. Voici les mots à inclure dans le texte : ${pickRandom(ajoutMod, 2)}`,
    "instruction" :"Écris uniquement le message final. Commence les message par 'En ce ' suivi de la date du jour (exemple format : lundi 1 janvier 2025). Le message doit être clair et compréhensible de tous. Maximum 3 phrases sans emoji."
    //"prompt" : `Date : ${dateStr}. Objectif : souhaiter une bonne journée avec beaucoup d'humour geek.`,
    //"instruction" :"Écris uniquement le message final. Commence les message par 'En ce ' suivi de la date du jour (exemple format : lundi 1 janvier 2025). Maximum 3 phrases sans emoji."
  }
  return retour;
}

function requestPrompt(date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10);
  const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
  const day = date.getDate();
  const monthName = date.toLocaleDateString('fr-FR', { month: 'long' });
  const year = date.getFullYear();
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
 * @param {Date} date - Date à utiliser
 * @returns {object} - {prompt: string, instruction: string}
 */
function formatFinalPrompt(rawPrompt, date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10);
  const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
  const day = date.getDate();
  const monthName = date.toLocaleDateString('fr-FR', { month: 'long' });
  const year = date.getFullYear();
  const fullDate = `${dayName} ${day} ${monthName} ${year}`;

  return {
    prompt: rawPrompt,
    instruction: `Écris UNIQUEMENT le message final. Commence obligatoirement par "En ce ${fullDate}". 
                  Le message doit faire 1 à 3 phrases maximum, être clair, positif et sans emoji.
                  Respecte exactement les contraintes du prompt fourni.`
  };
}

function getHumour(){
  return ANGLE_HUMOUR.toString();
}
function getEcriture(){
  return STYLE_ECRITURE.toString();
}
function getNarratif(){
  return DISPOSITIF_NARRATIF.toString();
}
function getContrainte(){
  return CONTRAINTE_LEGERE.toString();
}


module.exports = {
    buildPrompt,
    requestPrompt,
    formatFinalPrompt,
    getHumour,
    getEcriture,
    getNarratif,
    getContrainte
}