const { getConfig, saveModuleConfig } = require('../../config/index.js');

function getCaptchaConfig() {
    const fullConfig = getConfig();
    const c = fullConfig.captcha || {};
    const math = c.math_questions || {};
    const msgs = c.messages || {};
    const logMsgs = c.log_messages || {};

    let operationWeights = { '+': 0.6, '-': 0.3, '*': 0.1 };
    if (math.operation_weights) {
        if (Array.isArray(math.operation_weights)) {
            operationWeights = {};
            math.operation_weights.forEach(item => {
                if (typeof item === 'object') {
                    Object.assign(operationWeights, item);
                }
            });
        } else if (typeof math.operation_weights === 'object') {
            operationWeights = math.operation_weights;
        }
    }

    const mathQuestionsObj = {
        MIN_NUMBER: math.min_number ?? math.MIN_NUMBER ?? 1,
        MAX_NUMBER: math.max_number ?? math.MAX_NUMBER ?? 20,
        OPERATIONS: math.operations ?? math.OPERATIONS ?? ['+', '-', '*'],
        OPERATION_WEIGHTS: operationWeights,
        min_number: math.min_number ?? 1,
        max_number: math.max_number ?? 20,
        operations: math.operations ?? ['+', '-', '*'],
        operation_weights: operationWeights
    };

    const messagesObj = {
        WELCOME_MESSAGE: msgs.welcome_message ?? msgs.WELCOME_MESSAGE ?? 'Bienvenue sur le serveur ! Pour accéder au reste du serveur, tu dois résoudre ce captcha :',
        CAPTCHA_QUESTION: msgs.captcha_question ?? msgs.CAPTCHA_QUESTION ?? 'Combien font {num1} {operator} {num2} ?',
        INSTRUCTIONS: msgs.instructions ?? msgs.INSTRUCTIONS ?? 'Réponds avec le résultat **en chiffres** (exemple: 18) dans ce canal.',
        SUCCESS_MESSAGE: msgs.success_message ?? msgs.SUCCESS_MESSAGE ?? '✅ Bravo ! Ta réponse est correcte. Tu as maintenant accès au serveur !',
        FAIL_MESSAGE: msgs.fail_message ?? msgs.FAIL_MESSAGE ?? 'Mauvaise réponse, tu n\'as plus que {attempts} tentative(s) <:Obsydemoncouverture:1488145689916473544>.',
        TIMEOUT_MESSAGE: msgs.timeout_message ?? msgs.TIMEOUT_MESSAGE ?? '⏰ Temps écoulé ! Le captcha a expiré. Veuillez réessayer en rejoignant à nouveau le serveur.',
        MAX_ATTEMPTS_MESSAGE: msgs.max_attempts_message ?? msgs.MAX_ATTEMPTS_MESSAGE ?? '❌ Trop de tentatives incorrectes. Veuillez quitter et rejoindre le serveur pour réessayer.',
        ALREADY_VERIFIED: msgs.already_verified ?? msgs.ALREADY_VERIFIED ?? '✅ Tu as déjà été vérifié !',
        welcome_message: msgs.welcome_message ?? 'Bienvenue sur le serveur ! Pour accéder au reste du serveur, tu dois résoudre ce captcha :',
        captcha_question: msgs.captcha_question ?? 'Combien font {num1} {operator} {num2} ?',
        instructions: msgs.instructions ?? 'Réponds avec le résultat **en chiffres** (exemple: 18) dans ce canal.',
        success_message: msgs.success_message ?? '✅ Bravo ! Ta réponse est correcte. Tu as maintenant accès au serveur !',
        fail_message: msgs.fail_message ?? 'Mauvaise réponse, tu n\'as plus que {attempts} tentative(s) <:Obsydemoncouverture:1488145689916473544>.',
        timeout_message: msgs.timeout_message ?? '⏰ Temps écoulé ! Le captcha a expiré. Veuillez réessayer en rejoignant à nouveau le serveur.',
        max_attempts_message: msgs.max_attempts_message ?? '❌ Trop de tentatives incorrectes. Veuillez quitter et rejoindre le serveur pour réessayer.',
        already_verified: msgs.already_verified ?? '✅ Tu as déjà été vérifié !'
    };

    const logMessagesObj = {
        CAPTCHA_CREATED: logMsgs.captcha_created ?? logMsgs.CAPTCHA_CREATED ?? '🔒 Captcha créé pour {username} ({userId})',
        CAPTCHA_SUCCESS: logMsgs.captcha_success ?? logMsgs.CAPTCHA_SUCCESS ?? '✅ Captcha validé pour {username} ({userId})',
        CAPTCHA_FAILED: logMsgs.captcha_failed ?? logMsgs.CAPTCHA_FAILED ?? '❌ Captcha échoué pour {username} ({userId}) - Tentative {attempt}/{max}',
        CAPTCHA_TIMEOUT: logMsgs.captcha_timeout ?? logMsgs.CAPTCHA_TIMEOUT ?? '⏰ Captcha expiré pour {username} ({userId})',
        captcha_created: logMsgs.captcha_created ?? '🔒 Captcha créé pour {username} ({userId})',
        captcha_success: logMsgs.captcha_success ?? '✅ Captcha validé pour {username} ({userId})',
        captcha_failed: logMsgs.captcha_failed ?? '❌ Captcha échoué pour {username} ({userId}) - Tentative {attempt}/{max}',
        captcha_timeout: logMsgs.captcha_timeout ?? '⏰ Captcha expiré pour {username} ({userId})'
    };

    return {
        get ENABLED() { return c.enabled !== undefined ? c.enabled : true; },
        set ENABLED(v) { c.enabled = v; saveModuleConfig('captcha', c); },
        get enabled() { return this.ENABLED; },
        set enabled(v) { this.ENABLED = v; },

        get CAPTCHA_LOG_CHANNEL() {
            return fullConfig.startup_notifier?.channel_id || c.channel_id || process.env.LOG_CHANNEL_ID;
        },

        get CAPTCHA_CHANNEL_ID() { return c.channel_id || null; },
        set CAPTCHA_CHANNEL_ID(v) { c.channel_id = v; saveModuleConfig('captcha', c); },
        get channel_id() { return this.CAPTCHA_CHANNEL_ID; },
        set channel_id(v) { this.CAPTCHA_CHANNEL_ID = v; },

        get CAPTCHA_CHANNEL_NAME() { return c.captcha_channel_name || '✅-verification-captcha'; },
        set CAPTCHA_CHANNEL_NAME(v) { c.captcha_channel_name = v; saveModuleConfig('captcha', c); },
        get captcha_channel_name() { return this.CAPTCHA_CHANNEL_NAME; },

        get VERIFIED_ROLE_ID() { return c.verified_role_id || '1337917252732850206'; },
        set VERIFIED_ROLE_ID(v) { c.verified_role_id = v; saveModuleConfig('captcha', c); },
        get verified_role_id() { return this.VERIFIED_ROLE_ID; },
        set verified_role_id(v) { this.VERIFIED_ROLE_ID = v; },

        get CAPTCHA_TIMEOUT() { return c.captcha_timeout || 10; },
        set CAPTCHA_TIMEOUT(v) { c.captcha_timeout = v; saveModuleConfig('captcha', c); },
        get captcha_timeout() { return this.CAPTCHA_TIMEOUT; },

        get MAX_ATTEMPTS() { return c.max_attempts || 3; },
        set MAX_ATTEMPTS(v) { c.max_attempts = v; saveModuleConfig('captcha', c); },
        get max_attempts() { return this.MAX_ATTEMPTS; },

        get MATH_QUESTIONS() { return mathQuestionsObj; },
        get math_questions() { return mathQuestionsObj; },

        get MESSAGES() { return messagesObj; },
        get messages() { return messagesObj; },

        get LOG_MESSAGES() { return logMessagesObj; },
        get log_messages() { return logMessagesObj; }
    };
}

module.exports = new Proxy({}, {
    get(target, prop) {
        const conf = getCaptchaConfig();
        if (prop in conf) {
            return conf[prop];
        }
        return getConfig().captcha?.[prop];
    },
    set(target, prop, value) {
        const conf = getCaptchaConfig();
        conf[prop] = value;
        return true;
    },
    ownKeys() {
        const conf = getCaptchaConfig();
        return Array.from(new Set([...Object.keys(conf), ...Object.keys(getConfig().captcha || {})]));
    },
    getOwnPropertyDescriptor(target, prop) {
        return {
            enumerable: true,
            configurable: true,
            value: this.get(target, prop)
        };
    }
});
