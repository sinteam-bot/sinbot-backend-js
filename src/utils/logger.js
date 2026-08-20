const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class BotLogger extends EventEmitter {
    constructor(maxEntries = 1000) {
        super();
        this.maxEntries = maxEntries;
        this.logs = [];
        this.initialized = false;
        
        // Dossier de journalisation des fichiers de logs
        this.logsDir = path.join(__dirname, '../../logs');
        this.initLogFiles();

        this.originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info,
            debug: console.debug || console.log
        };
    }

    initLogFiles() {
        try {
            if (!fs.existsSync(this.logsDir)) {
                fs.mkdirSync(this.logsDir, { recursive: true });
            }
            // Charger les derniers logs du fichier actuel au démarrage
            this.loadRecentLogsFromFile();
        } catch (e) {
            this.originalConsole?.error?.('Erreur création dossier logs:', e);
        }
    }

    getLogFilePath(date = new Date()) {
        const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
        return path.join(this.logsDir, `bot-${dateStr}.log`);
    }

    getErrorLogFilePath() {
        return path.join(this.logsDir, 'error.log');
    }

    loadRecentLogsFromFile() {
        try {
            const todayFile = this.getLogFilePath();
            if (fs.existsSync(todayFile)) {
                const content = fs.readFileSync(todayFile, 'utf-8');
                const lines = content.trim().split('\n').filter(Boolean);
                const recentLines = lines.slice(-200);

                recentLines.forEach(line => {
                    // Format: [2026-08-20T14:15:00.000Z] [INFO] [SYSTEM] Message...
                    const match = line.match(/^\[(.*?)\] \[([A-Z]+)\] \[([A-Z]+)\] (.*)$/);
                    if (match) {
                        this.logs.push({
                            id: Math.random().toString(36).substring(2, 9),
                            timestamp: match[1],
                            level: match[2],
                            category: match[3],
                            message: match[4]
                        });
                    }
                });
            }
        } catch (e) {
            // Ignorer si échec de lecture
        }
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

        console.info = (...args) => {
            this.originalConsole.info(...args);
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

        console.debug = (...args) => {
            this.originalConsole.debug(...args);
            const msg = formatArgs(args);
            if (msg.trim()) {
                this.addLog('DEBUG', msg, this.detectCategory(msg));
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

    writeToLogFile(entry) {
        try {
            const date = new Date(entry.timestamp);
            const filePath = this.getLogFilePath(date);
            const cleanMessage = entry.message.replace(/\r?\n/g, ' ');
            const logLine = `[${entry.timestamp}] [${entry.level}] [${entry.category}] ${cleanMessage}\n`;

            fs.appendFile(filePath, logLine, () => {});

            // Si erreur, écrire également dans error.log
            if (entry.level === 'ERROR') {
                fs.appendFile(this.getErrorLogFilePath(), logLine, () => {});
            }
        } catch (e) {
            // Ignorer pour ne pas bloquer l'application
        }
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

        // Écriture dans le fichier journal sur disque
        this.writeToLogFile(entry);

        this.emit('log', entry);
        return entry;
    }

    info(message, category = 'SYSTEM', metadata = null) {
        this.originalConsole.info(`[INFO] [${category}] ${message}`);
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
