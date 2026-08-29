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

    /**
     * Localise l'appelant via la stack trace (Style Winston / Pino)
     * Extrait le fichier source, la ligne, la méthode et déduit le module d'origine
     * @returns {{ file: string, path: string, fullPath: string, line: number, method: string, inferredModule: string|null }|null}
     */
    getCallerLocation() {
        try {
            const err = new Error();
            const stack = err.stack ? err.stack.split('\n') : [];

            for (let i = 2; i < stack.length; i++) {
                const line = stack[i];
                if (!line) continue;
                if (line.includes('logger.js') || line.includes('node:internal') || line.includes('node_modules')) {
                    continue;
                }

                // Format standard V8 : at FunctionName (path/to/file.js:123:45) ou at path/to/file.js:123:45
                const match = line.match(/at\s+(?:(.*?)\s+\()?([^()]+):(\d+):(\d+)\)?/);
                if (match) {
                    const fullPath = match[2];
                    const lineNumber = parseInt(match[3], 10);
                    const methodName = match[1] || 'anonymous';
                    
                    const projectRoot = path.resolve(__dirname, '../../');
                    let relativePath = path.relative(projectRoot, fullPath);
                    if (relativePath.startsWith('../')) {
                        relativePath = path.basename(fullPath);
                    }
                    const fileName = path.basename(fullPath);
                    const inferredModule = this.inferModuleFromPath(relativePath);

                    return {
                        file: `${fileName}:${lineNumber}`,
                        path: relativePath,
                        fullPath,
                        line: lineNumber,
                        method: methodName,
                        inferredModule
                    };
                }
            }
        } catch (e) {
            // Ignorer en cas d'erreur de stack trace
        }
        return null;
    }

    /**
     * Déduit le module d'origine à partir du chemin du fichier source
     * @param {string} relPath
     * @returns {string|null}
     */
    inferModuleFromPath(relPath) {
        if (!relPath || typeof relPath !== 'string') return null;
        const p = relPath.replace(/\\/g, '/').toLowerCase();

        if (p.includes('modules/util_bump-reminder') || p.includes('modules/bump')) return 'BUMP';
        if (p.includes('modules/welcome_welcome') || p.includes('modules/welcome')) return 'WELCOME';
        if (p.includes('modules/community_daily-message') || p.includes('modules/daily')) return 'DAILY';
        if (p.includes('modules/security_captcha') || p.includes('modules/security_captcha') || p.includes('modules/captcha')) return 'CAPTCHA';
        if (p.includes('modules/engagement_xp-level') || p.includes('modules/xp')) return 'XP';
        if (p.includes('modules/game_count-down') || p.includes('modules/countdown')) return 'COUNTDOWN';
        if (p.includes('modules/game_road-to-infinite') || p.includes('modules/infinite')) return 'INFINITE';
        if (p.includes('modules/util_startup') || p.includes('modules/startup')) return 'STARTUP';
        
        if (p.includes('services/imageproxyservice')) return 'API';
        if (p.includes('services/discordcacheservice')) return 'DISCORD';
        if (p.includes('src/database') || p.includes('src/db/')) return 'DATABASE';
        if (p.includes('src/web/') || p.includes('webrouter')) return 'API';
        if (p.includes('src/events/') || p.includes('eventbus')) return 'EVENT';
        if (p.includes('src/commands/')) return 'COMMANDS';
        if (p.includes('src/config/')) return 'CONFIG';
        if (p.includes('src/core/scheduler') || p.includes('cron')) return 'SCHEDULER';
        if (p.includes('src/core/modulemanager') || p.includes('src/core/container')) return 'SYSTEM';
        if (p.includes('src/index.js')) return 'SYSTEM';

        return null;
    }

    loadRecentLogsFromFile() {
        try {
            const todayFile = this.getLogFilePath();
            if (fs.existsSync(todayFile)) {
                const content = fs.readFileSync(todayFile, 'utf-8');
                const lines = content.trim().split('\n').filter(Boolean);
                const recentLines = lines.slice(-300);

                recentLines.forEach(line => {
                    // Pattern 4 blocs : [timestamp] [level] [category] [file:line] message
                    const match4 = line.match(/^\[(.*?)\]\s*\[([a-zA-Z0-9_-]+)\]\s*\[([a-zA-Z0-9_ -]+)\]\s*\[([a-zA-Z0-9_.-]+:\d+)\]\s*(.*)$/);
                    if (match4) {
                        this.logs.push({
                            id: Math.random().toString(36).substring(2, 9),
                            timestamp: match4[1],
                            level: match4[2].toUpperCase(),
                            category: match4[3].toUpperCase(),
                            caller: { file: match4[4] },
                            message: match4[5]
                        });
                        return;
                    }

                    // Pattern 3 blocs : [timestamp] [level] [category] message
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

                    // Pattern 2 blocs : [timestamp] [level] message
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
                const caller = this.getCallerLocation();
                this.addLog('INFO', msg, this.detectCategory(msg, caller), null, caller);
            }
        };

        console.info = (...args) => {
            this.originalConsole.info(...args);
            const msg = formatArgs(args);
            if (msg.trim()) {
                const caller = this.getCallerLocation();
                this.addLog('INFO', msg, this.detectCategory(msg, caller), null, caller);
            }
        };

        console.warn = (...args) => {
            this.originalConsole.warn(...args);
            const msg = formatArgs(args);
            if (msg.trim()) {
                const caller = this.getCallerLocation();
                this.addLog('WARN', msg, this.detectCategory(msg, caller), null, caller);
            }
        };

        console.error = (...args) => {
            this.originalConsole.error(...args);
            const msg = formatArgs(args);
            if (msg.trim()) {
                const caller = this.getCallerLocation();
                this.addLog('ERROR', msg, this.detectCategory(msg, caller), null, caller);
            }
        };

        console.debug = (...args) => {
            this.originalConsole.debug(...args);
            const msg = formatArgs(args);
            if (msg.trim()) {
                const caller = this.getCallerLocation();
                this.addLog('DEBUG', msg, this.detectCategory(msg, caller), null, caller);
            }
        };
    }

    /**
     * Détecte la catégorie/module d'un message avec localisation Winston
     * @param {string} message
     * @param {object|null} caller
     * @returns {string}
     */
    detectCategory(message, caller = null) {
        if (!message || typeof message !== 'string') return caller?.inferredModule || 'SYSTEM';
        const msg = message.trim();
        const msgUpper = msg.toUpperCase();

        // 1. Détection prioritaire par tags explicites entre crochets [TAG]
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

        // 2. Détection par fichier source appelant (Winston Source Localization)
        if (caller && caller.inferredModule && caller.inferredModule !== 'SYSTEM') {
            return caller.inferredModule;
        }

        // 3. Détection contextuelle par mots-clés et symboles
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

        return caller?.inferredModule || 'SYSTEM';
    }

    writeToLogFile(entry) {
        try {
            const date = new Date(entry.timestamp);
            const filePath = this.getLogFilePath(isNaN(date.getTime()) ? new Date() : date);
            const cleanMessage = entry.message.replace(/\r?\n/g, ' ');
            const callerTag = entry.caller?.file ? ` [${entry.caller.file}]` : '';
            const logLine = `[${entry.timestamp}] [${entry.level}] [${entry.category}]${callerTag} ${cleanMessage}\n`;

            fs.appendFile(filePath, logLine, () => {});

            // Si erreur, écrire également dans error.log
            if (entry.level === 'ERROR') {
                fs.appendFile(this.getErrorLogFilePath(), logLine, () => {});
            }
        } catch (e) {
            // Ignorer pour ne pas bloquer l'application
        }
    }

    addLog(level, message, category = null, metadata = null, caller = null) {
        const callerLoc = caller || this.getCallerLocation();
        const finalCategory = (category && category !== 'SYSTEM') 
            ? category 
            : this.detectCategory(message, callerLoc);

        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
            timestamp: new Date().toISOString(),
            level: (level || 'INFO').toUpperCase(),
            category: finalCategory || 'SYSTEM',
            caller: callerLoc ? { file: callerLoc.file, path: callerLoc.path, method: callerLoc.method } : undefined,
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

    /**
     * Crée un logger enfant typé pour un module donné (Style Winston)
     * @param {string} category
     * @param {object} defaultMeta
     * @returns {object}
     */
    createLogger(category, defaultMeta = {}) {
        return {
            info: (msg, meta) => this.info(msg, category, { ...defaultMeta, ...meta }),
            warn: (msg, meta) => this.warn(msg, category, { ...defaultMeta, ...meta }),
            error: (msg, meta) => this.error(msg, category, { ...defaultMeta, ...meta }),
            debug: (msg, meta) => this.debug(msg, category, { ...defaultMeta, ...meta }),
            event: (msg, meta) => this.addLog('EVENT', msg, category, { ...defaultMeta, ...meta })
        };
    }

    info(message, category = null, metadata = null) {
        const caller = this.getCallerLocation();
        const finalCategory = (category && category !== 'SYSTEM') ? category : this.detectCategory(message, caller);
        this.originalConsole.info(`[INFO] [${finalCategory}] ${message}`);
        return this.addLog('INFO', message, finalCategory, metadata, caller);
    }

    warn(message, category = null, metadata = null) {
        const caller = this.getCallerLocation();
        const finalCategory = (category && category !== 'SYSTEM') ? category : this.detectCategory(message, caller);
        this.originalConsole.warn(`[WARN] [${finalCategory}] ${message}`);
        return this.addLog('WARN', message, finalCategory, metadata, caller);
    }

    error(message, category = null, metadata = null) {
        const caller = this.getCallerLocation();
        const finalCategory = (category && category !== 'SYSTEM') ? category : this.detectCategory(message, caller);
        this.originalConsole.error(`[ERROR] [${finalCategory}] ${message}`);
        return this.addLog('ERROR', message, finalCategory, metadata, caller);
    }

    debug(message, category = null, metadata = null) {
        const caller = this.getCallerLocation();
        const finalCategory = (category && category !== 'SYSTEM') ? category : this.detectCategory(message, caller);
        this.originalConsole.debug(`[DEBUG] [${finalCategory}] ${message}`);
        return this.addLog('DEBUG', message, finalCategory, metadata, caller);
    }

    event(message, metadata = null) {
        const caller = this.getCallerLocation();
        return this.addLog('EVENT', message, 'EVENT', metadata, caller);
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
            result = result.filter(l => 
                l.message.toLowerCase().includes(query) || 
                (l.category && l.category.toLowerCase().includes(query)) ||
                (l.caller?.file && l.caller.file.toLowerCase().includes(query))
            );
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
