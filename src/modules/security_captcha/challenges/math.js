/**
 * challenges/math.js — Générateur de challenges arithmétiques (texte).
 *
 * Réutilise la logique de captcha.service.generateMathQuestion pour
 * produire { question, answer }.
 */

function generateMathQuestion(captchaConfig = {}) {
    const math = captchaConfig.math_questions || {};
    const minNum = math.min_number ?? captchaConfig.min_number ?? 1;
    const maxNum = math.max_number ?? captchaConfig.max_number ?? 20;

    const operations = math.operations ?? captchaConfig.operations ?? ['+', '-', '*'];
    const weights = math.operation_weights ?? captchaConfig.operation_weights ?? { '+': 0.5, '-': 0.3, '*': 0.2 };

    const weightedOperations = [];
    for (const op of operations) {
        const count = Math.floor((weights[op] ?? 0.3) * 100);
        for (let i = 0; i < count; i++) weightedOperations.push(op);
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
            num1 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
            num2 = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
            answer = num1 + num2;
    }

    const numberToFrench = (n) => {
        const map = { 1:'un',2:'deux',3:'trois',4:'quatre',5:'cinq',6:'six',7:'sept',8:'huit',9:'neuf',10:'dix',
            11:'onze',12:'douze',13:'treize',14:'quatorze',15:'quinze',16:'seize',17:'dix-sept',18:'dix-huit',
            19:'dix-neuf',20:'vingt' };
        return map[n] || n.toString();
    };

    const num1Str = numberToFrench(num1);
    const num2Str = numberToFrench(num2);

    const useWordOperators = math.use_word_operators ?? captchaConfig.use_word_operators ?? false;
    const wordOperatorsMap = {
        '+': 'plus',
        '-': 'moins',
        '*': 'fois',
        ...(math.word_operators || {}),
        ...(captchaConfig.word_operators || {})
    };

    const displayOperator = useWordOperators ? (wordOperatorsMap[operator] || operator) : operator;

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
        useWordOperators,
        // Valeurs numériques brutes pour accessibilité TTS (math.js)
        num1Value: num1,
        num2Value: num2
    };
}

module.exports = {
    type: 'math',
    label: 'Calcul arithmétique (texte)',
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
                num2Value: q.num2Value
            }
        };
    },
    async verify({ userAnswer, expectedAnswer }) {
        if (typeof userAnswer !== 'string' || typeof expectedAnswer !== 'string') return false;
        const normalize = (s) => s.trim().replace(/\s+/g, '');
        return normalize(userAnswer) === normalize(expectedAnswer);
    }
};