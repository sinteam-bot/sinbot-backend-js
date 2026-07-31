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

function requestPrompt(){
  var date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const generateprompt = `Tu es un générateur de prompts créatifs pour messages Discord.

      Ta mission est de produire un prompt unique qui servira à générer un message de "bonne journée".

      Contraintes :
      - Le prompt doit être en français
      - Il doit donner une direction claire (ton, style, thème)
      - Il doit varier chaque jour (ambiance, humour, inspiration, saison, événements, etc.)
      - Il peut inclure :
        - un style (poétique, drôle, motivant, absurde, philosophique…)
        - un contexte (météo, jour de la semaine, saison, événement imaginaire ou réel)
        - une contrainte créative (rime, emoji, métaphore, longueur, etc.)

      Objectif :
      Créer un prompt qui permettra de générer un message court (1 à 3 phrases) de "bonne journée" adapté à Discord.

      Contraintes supplémentaires pour le message final :
      - Le message doit obligatoirement commencer par "En ce ${dateStr}"
      - Le format de la date doit être exactement : "lundi 1 janvier 2026"

      Important :
      - Ne génère PAS le message final
      - Génère UNIQUEMENT le prompt à utiliser ensuite

      Exemples de sortie attendue :

      "Rédige un message de bonne journée sur un ton humoristique comme si un chat donnait des conseils de vie, avec 2 emojis, et commence par 'En ce lundi 1 janvier 2026'."

      "Écris un message de bonne journée poétique inspiré d’un matin de printemps, en 2 phrases maximum, en commençant par 'En ce lundi 1 janvier 2026'."

      "Crée un message de bonne journée motivant façon coach sportif, avec une énergie intense et une punchline finale, et commence par 'En ce lundi 1 janvier 2026'."`

 return generateprompt;
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
    getHumour,
    getEcriture,
    getNarratif,
    getContrainte
}