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
                const recentLines = lines.slice(-300);

                recentLines.forEach(line => {
                    // Pattern avec 3 blocs entre crochets : [timestamp] [level] [category] message
                    const match3 = line.match(/^\[(.*?)\]\s*\[([a-zA-Z0-9_-]+)\]\s*\[([a-zA-Z0-9_ -]+)\]\s*(.*)$/);
                    if (match3) {
                        this.logs.push({
                            id: Math.random().toString(36).substring(2, 9),
                            timestamp: match3[1],
                            level: match3[2].toUpperCase(),
                            category: match3[3].toUpperCase(),
                            message: match3[4]
                        });
                        return;
                    }

                    // Pattern avec 2 blocs entre crochets : [timestamp] [level] message
                    const match2 = line.match(/^\[(.*?)\]\s*\[([a-zA-Z0-9_-]+)\]\s*(.*)$/);
                    if (match2) {
                        const lvl = match2[2].toUpperCase();
                        const msg = match2[3];
                        this.logs.push({
                            id: Math.random().toString(36).substring(2, 9),
                            timestamp: match2[1],
                            level: lvl,
                            category: this.detectCategory(msg),
                            message: msg
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
        if (!message || typeof message !== 'string') return 'SYSTEM';
        const msg = message.trim();
        const msgUpper = msg.toUpperCase();

        // 1. Détection explicite par tags entre crochets [TAG]
        if (/\[(SECURITY_QUESTION|CAPTCHA|SECURITYQUESTION)\]/i.test(msg)) return 'CAPTCHA';
        if (/\[(BUMP|BUMP_REMINDER|BUMP SERVICE)\]/i.test(msg)) return 'BUMP';
        if (/\[(DAILY|DAILY_MESSAGE|DAILYMESSAGE)\]/i.test(msg)) return 'DAILY';
        if (/\[(XP|LEVEL|XP_LEVEL)\]/i.test(msg)) return 'XP';
        if (/\[(COUNTDOWN|COUNT_DOWN)\]/i.test(msg)) return 'COUNTDOWN';
        if (/\[(COUNTER|INFINITE|ROAD_TO_INFINITE)\]/i.test(msg)) return 'INFINITE';
        if (/\[(WELCOME)\]/i.test(msg)) return 'WELCOME';
        if (/\[(STARTUP_NOTIFIER|STARTUPNOTIFIER|STARTUP)\]/i.test(msg)) return 'STARTUP';
        if (/\[(DISCORD CACHE|DISCORD_CACHE|DISCORD)\]/i.test(msg)) return 'DISCORD';
        if (/\[(EVENT_BUS|EVENTBUS|EVENT)\]/i.test(msg)) return 'EVENT';
        if (/\[(MODULE_MANAGER|MODULEMANAGER)\]/i.test(msg)) return 'SYSTEM';
        if (/\[(CONFIG)\]/i.test(msg)) return 'CONFIG';
        if (/\[(DATABASE|DB|POSTGRES|DRIZZLE|SQLITE)\]/i.test(msg)) return 'DATABASE';
        if (/\[(WEB|API|ROUTER|EXPRESS|WEBHOOK|PROXY|IMAGE_PROXY)\]/i.test(msg)) return 'API';

        // 2. Détection contextuelle par mots-clés et symboles
        if (msgUpper.includes('ROUTE API MONTÉE') || msgUpper.includes('SERVEUR WEBHOOK') || msgUpper.includes('HEALTH:')) return 'API';
        if (msgUpper.includes('TÂCHE CRON PLANIFIÉE') || msgUpper.includes('SCHEDULER')) return 'SCHEDULER';
        if (msgUpper.includes('ÉVÉNEMENT DISCORD BRANCHÉ') || msgUpper.includes('LISTENER DISCORD')) return 'EVENT';
        if (msgUpper.includes('POSTGRESQL') || msgUpper.includes('DRIZZLE ORM') || msgUpper.includes('BASE DE DONNÉES')) return 'DATABASE';
        if (msgUpper.includes('OPENROUTER') || msgUpper.includes('NEMOTRON') || msgUpper.includes('OPENAI') || msgUpper.includes('CHATGPT')) return 'AI';
        if (msgUpper.includes('BOT DISCORD DÉMARRÉ') || msgUpper.includes('CONNECTÉ EN TANT QUE') || msgUpper.includes('COMMANDE(S) CHARGÉE(S)')) return 'DISCORD';
        if (msgUpper.includes('CAPTCHA')) return 'CAPTCHA';
        if (msgUpper.includes('BUMP')) return 'BUMP';
        if (msgUpper.includes('DAILY MESSAGE') || msgUpper.includes('PENSÉE DU JOUR')) return 'DAILY';
        if (msgUpper.includes('XP') || msgUpper.includes('NIVEAU')) return 'XP';
        if (msgUpper.includes('COUNTDOWN') || msgUpper.includes('DÉCOMPTE')) return 'COUNTDOWN';
        if (msgUpper.includes('COUNTER') || msgUpper.includes('INFINI') || msgUpper.includes('COMPTEUR')) return 'INFINITE';
        if (msgUpper.includes('BIENVENUE') || msgUpper.includes('WELCOME')) return 'WELCOME';
        if (msgUpper.includes('STARTUP') || msgUpper.includes('NOTIFICATION DE DÉMARRAGE')) return 'STARTUP';

        return 'SYSTEM';
    }

    writeToLogFile(entry) {
        try {
            const date = new Date(entry.timestamp);
            const filePath = this.getLogFilePath(isNaN(date.getTime()) ? new Date() : date);
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
