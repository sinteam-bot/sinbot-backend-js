const EventEmitter = require('events');

class BotLogger extends EventEmitter {
    constructor(maxEntries = 1000) {
        super();
        this.maxEntries = maxEntries;
        this.logs = [];
        this.initialized = false;
        this.originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info
        };
    }

    initConsoleInterceptor() {
        if (this.initialized) return;
        this.initialized = true;

        const formatArgs = (args) => {
            return args.map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch (e) {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
        };

        console.log = (...args) => {
            this.originalConsole.log(...args);
            const msg = formatArgs(args);
            if (msg.trim()) {
                this.addLog('INFO', msg, this.detectCategory(msg));
            }
        };

        console.warn = (...args) => {
            this.originalConsole.warn(...args);
            const msg = formatArgs(args);
            if (msg.trim()) {
                this.addLog('WARN', msg, this.detectCategory(msg));
            }
        };

        console.error = (...args) => {
            this.originalConsole.error(...args);
            const msg = formatArgs(args);
            if (msg.trim()) {
                this.addLog('ERROR', msg, this.detectCategory(msg));
            }
        };
    }

    detectCategory(message) {
        const msgUpper = message.toUpperCase();
        if (msgUpper.includes('CAPTCHA')) return 'CAPTCHA';
        if (msgUpper.includes('XP') || msgUpper.includes('LEVEL') || msgUpper.includes('NIVEAU')) return 'XP';
        if (msgUpper.includes('EVENT') || msgUpper.includes('ÉVÉNEMENT')) return 'EVENT';
        if (msgUpper.includes('DISCORD') || msgUpper.includes('CONNECTÉ') || msgUpper.includes('COMMAND')) return 'DISCORD';
        if (msgUpper.includes('EXPRESS') || msgUpper.includes('SERVEUR') || msgUpper.includes('WEBHOOK')) return 'WEB';
        if (msgUpper.includes('OPENAI') || msgUpper.includes('OPENROUTER') || msgUpper.includes('DAILY')) return 'AI';
        return 'SYSTEM';
    }

    addLog(level, message, category = 'SYSTEM', metadata = null) {
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
            timestamp: new Date().toISOString(),
            level: (level || 'INFO').toUpperCase(),
            category: category || 'SYSTEM',
            message: typeof message === 'string' ? message : JSON.stringify(message),
            metadata
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxEntries) {
            this.logs.shift();
        }

        this.emit('log', entry);
        return entry;
    }

    info(message, category = 'SYSTEM', metadata = null) {
        this.originalConsole.log(`[INFO] [${category}] ${message}`);
        return this.addLog('INFO', message, category, metadata);
    }

    warn(message, category = 'SYSTEM', metadata = null) {
        this.originalConsole.warn(`[WARN] [${category}] ${message}`);
        return this.addLog('WARN', message, category, metadata);
    }

    error(message, category = 'SYSTEM', metadata = null) {
        this.originalConsole.error(`[ERROR] [${category}] ${message}`);
        return this.addLog('ERROR', message, category, metadata);
    }

    event(message, metadata = null) {
        return this.addLog('EVENT', message, 'EVENT', metadata);
    }

    getLogs(options = {}) {
        const { level, category, search, limit = 200, since } = options;
        let result = [...this.logs];

        if (level && level !== 'ALL') {
            const levels = level.split(',').map(l => l.trim().toUpperCase());
            result = result.filter(l => levels.includes(l.level));
        }

        if (category && category !== 'ALL') {
            const categories = category.split(',').map(c => c.trim().toUpperCase());
            result = result.filter(l => categories.includes(l.category));
        }

        if (search) {
            const query = search.toLowerCase();
            result = result.filter(l => l.message.toLowerCase().includes(query) || (l.category && l.category.toLowerCase().includes(query)));
        }

        if (since) {
            const sinceDate = new Date(since).getTime();
            result = result.filter(l => new Date(l.timestamp).getTime() > sinceDate);
        }

        if (limit && Number(limit) > 0) {
            result = result.slice(-Math.min(Number(limit), 1000));
        }

        return result;
    }

    clear() {
        this.logs = [];
        this.emit('clear');
    }
}

const logger = new BotLogger();
module.exports = logger;
