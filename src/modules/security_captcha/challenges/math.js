/**
 * challenges/math.js — Générateur de challenges arithmétiques.
 *
 * Modes de représentation configurables par champ :
 *   - num1_mode / num2_mode :
 *       'text'   → nombre en toutes lettres (ex: "douze")
 *       'digit'  → chiffre brut (ex: "12")
 *       'random' → le bot choisit aléatoirement à chaque génération
 *   - operator_mode :
 *       'text'   → mot français (ex: "plus")
 *       'symbol' → symbole mathématique (ex: "+")
 *       'random' → le bot choisit aléatoirement à chaque génération
 *
 * Si un mode est invalide ou absent, fallback sur les valeurs par
 * défaut historiques :
 *   num1/num2 → text (rétrocompatibilité)
 *   operator  → symbol (rétrocompatibilité)
 */

const { numberToFrench: numberToFrenchExt } = require('./tts.js');

const VALID_MODES = {
    num: ['text', 'digit', 'random'],
    op: ['text', 'symbol', 'random']
};

function _resolveNumMode(mode) {
    return VALID_MODES.num.includes(mode) ? mode : 'text';
}

function _resolveOpMode(mode) {
    return VALID_MODES.op.includes(mode) ? mode : 'symbol';
}

function _pickMode(resolved, fallback) {
    // Mode invalide → fallback par défaut (text/digit/symbol)
    if (resolved === 'text' || resolved === 'digit' || resolved === 'symbol') {
        if (resolved === 'symbol' && fallback !== 'symbol') {
            // operator_mode utilise 'symbol' comme valeur valide
            return resolved;
        }
        if (resolved === 'symbol' && fallback === 'symbol') return resolved;
        if (resolved === 'text' || resolved === 'digit') return resolved;
    }
    // 'random' : 50/50 entre fallback (text) et l'autre (digit/symbol)
    if (resolved === 'random') {
        const alternative = fallback === 'text' ? 'digit' : 'symbol';
        return Math.random() < 0.5 ? fallback : alternative;
    }
    // Mode inconnu → fallback
    return fallback;
}

const SIMPLE_NUMBER_TO_FRENCH = {
    1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq',
    6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix',
    11: 'onze', 12: 'douze', 13: 'treize', 14: 'quatorze', 15: 'quinze',
    16: 'seize', 17: 'dix-sept', 18: 'dix-huit', 19: 'dix-neuf', 20: 'vingt'
};

function _toFrench(n) {
    // Utilise la version étendue de tts si dispo, sinon le mapping simple
    if (numberToFrenchExt) {
        return numberToFrenchExt(n);
    }
    return SIMPLE_NUMBER_TO_FRENCH[n] || n.toString();
}

function generateMathQuestion(captchaConfig = {}) {
    const math = captchaConfig.math_questions || {};
    const minNum = math.min_number ?? captchaConfig.min_number ?? 1;
    const maxNum = math.max_number ?? captchaConfig.max_number ?? 20;

    const operations = math.operations ?? captchaConfig.operations ?? ['+', '-', '*'];
    const weights = math.operation_weights ?? captchaConfig.operation_weights ?? { '+': 0.5, '-': 0.3, '*': 0.2 };

    const weightedOperations = [];
    for (const op of operations) {
        const c = Math.floor((weights[op] ?? 0.3) * 100);
        for (let i = 0; i < c; i++) weightedOperations.push(op);
    }
    const operator = weightedOperations[Math.floor(Math.random() * weightedOperations.length)] || '+';

    let num1, num2, answer;
    switch (operator) {
        case '+':
            num1 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
            num2 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
            answer = num1 + num2;
            break;
        case '-':
            num1 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
            num2 = Math.floor(Math.random() * (num1 - minNum + 1)) + minNum;
            answer = num1 - num2;
            break;
        case '*':
            num1 = Math.floor(Math.random() * (Math.min(maxNum, 10) - minNum + 1)) + minNum;
            num2 = Math.floor(Math.random() * (Math.min(maxNum, 10) - minNum + 1)) + minNum;
            answer = num1 * num2;
            break;
        default:
            num1 = 1; num2 = 1; answer = 2;
    }

    // === Modes configurables ===
    const num1ModeResolved = _resolveNumMode(math.num1_mode ?? captchaConfig.num1_mode);
    const num2ModeResolved = _resolveNumMode(math.num2_mode ?? captchaConfig.num2_mode);
    const operatorModeResolved = _resolveOpMode(math.operator_mode ?? captchaConfig.operator_mode);

    const num1Mode = _pickMode(num1ModeResolved, 'text');
    const num2Mode = _pickMode(num2ModeResolved, 'text');
    const operatorMode = _pickMode(operatorModeResolved, 'symbol');

    const wordOperatorsMap = {
        '+': 'plus',
        '-': 'moins',
        '*': 'fois',
        ...(math.word_operators || {}),
        ...(captchaConfig.word_operators || {})
    };

    // Représentation effective
    const num1Str = num1Mode === 'text' ? _toFrench(num1) : num1.toString();
    const num2Str = num2Mode === 'text' ? _toFrench(num2) : num2.toString();
    const displayOperator = operatorMode === 'text' ? (wordOperatorsMap[operator] || operator) : operator;

    const template = captchaConfig.messages?.captcha_question
        || captchaConfig.messages?.CAPTCHA_QUESTION
        || 'Combien font {num1} {operator} {num2} ?';
    const question = template
        .replace('{num1}', num1Str)
        .replace('{operator}', displayOperator)
        .replace('{num2}', num2Str);

    return {
        question,
        answer: answer.toString(),
        num1: num1Str,
        num2: num2Str,
        operator,
        displayOperator,
        // Modes effectivement utilisés (après résolution du 'random')
        num1Mode,
        num2Mode,
        operatorMode,
        // Modes configurés (avant résolution random)
        num1ModeConfigured: num1ModeResolved,
        num2ModeConfigured: num2ModeResolved,
        operatorModeConfigured: operatorModeResolved,
        // Valeurs numériques brutes pour TTS accessibilité
        num1Value: num1,
        num2Value: num2
    };
}

module.exports = {
    type: 'math',
    label: 'Calcul arithmétique',
    VALID_MODES,
    generateMathQuestion,
    async generate({ captchaConfig }) {
        const q = generateMathQuestion(captchaConfig);
        return {
            question: q.question,
            answer: q.answer,
            payload: {
                type: 'math',
                num1: q.num1,
                num2: q.num2,
                operator: q.operator,
                num1Value: q.num1Value,
                num2Value: q.num2Value,
                num1Mode: q.num1Mode,
                num2Mode: q.num2Mode,
                operatorMode: q.operatorMode
            }
        };
    },
    async verify({ userAnswer, expectedAnswer }) {
        if (typeof userAnswer !== 'string' || typeof expectedAnswer !== 'string') return false;
        const normalize = (s) => s.trim().replace(/\s+/g, '');
        return normalize(userAnswer) === normalize(expectedAnswer);
    }
};