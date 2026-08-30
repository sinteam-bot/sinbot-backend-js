const { EmbedBuilder } = require('discord.js');
const { execSync } = require('child_process');
const { Injectable } = require('../../core/index.js');
const { config, getConfig } = require('../../config/index.js');
const { getBotState, setBotState } = require('../../db/schemas/shared/bot-state.repository.js');

class StartupNotifierService {
    constructor() {}

    async getConfig(guildId) {
        if (guildId) {
            try {
                const { getFeatureConfig } = require('../../config/c12-loader.js');
                const cfg = await getFeatureConfig(guildId, 'startup_notifier');
                if (cfg && Object.keys(cfg).length > 0) return cfg;
            } catch (e) {
                console.warn(`[StartupNotifier] Erreur chargement config guild ${guildId}:`, e.message);
            }
        }
        try {
            const { getFeatureConfig } = require('../../config/c12-loader.js');
            const globalCfg = await getFeatureConfig(null, 'startup_notifier');
            if (globalCfg && Object.keys(globalCfg).length > 0) return globalCfg;
        } catch {}
        const currentConfig = getConfig ? getConfig() : config;
        return currentConfig.startup_notifier || {};
    }

    /**
     * Récupère le SHA du commit courant depuis l'environnement Docker ou Git local
     */
    getCurrentCommitInfo() {
        const notifierConfig = this.getConfig();
        let sha = notifierConfig.last_commit_sha || process.env.GIT_COMMIT_SHA;
        if (sha && sha !== 'dev' && sha !== '') {
            return {
                sha: sha.trim(),
                source: 'docker-env'
            };
        }

        try {
            const gitSha = execSync('git rev-parse HEAD', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 2000
            }).trim();

            if (gitSha) {
                return {
                    sha: gitSha,
                    source: 'local-git'
                };
            }
        } catch {
            // Hors d'un dépôt git ou git non disponible
        }

        return {
            sha: null,
            source: 'unknown'
        };
    }

    /**
     * Récupère l'historique des commits depuis le dépôt Git local
     */
    getLocalGitCommits(limit = 5, fromSha = null) {
        try {
            const notifierConfig = this.getConfig();
            const repo = notifierConfig.github?.repo || process.env.GITHUB_REPO || 'sinteam-bot/chienne-bot';
            const repoUrl = `https://github.com/${repo}`;

            const range = fromSha ? `${fromSha}..HEAD` : `-n ${limit}`;
            const stdout = execSync(`git log ${range} --pretty=format:"%H|%an|%s"`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 2000
            }).trim();

            if (!stdout) return [];

            return stdout.split('\n').filter(Boolean).map(line => {
                const [sha, author, ...msgParts] = line.split('|');
                const message = msgParts.join('|');
                return {
                    sha,
                    author: { login: author, name: author },
                    commit: {
                        author: { name: author },
                        message
                    },
                    html_url: sha ? `${repoUrl}/commit/${sha}` : null
                };
            });
        } catch {
            return [];
        }
    }

    /**
     * Effectue un appel vers l'API GitHub
     */
    async fetchGithubApi(endpoint) {
        const notifierConfig = this.getConfig();
        const repo = notifierConfig.github?.repo || process.env.GITHUB_REPO || 'sinteam-bot/chienne-bot';
        const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com/repos/${repo}${endpoint}`;

        const headers = {
            'User-Agent': 'chienne-bot-discord',
            'Accept': 'application/vnd.github+json'
        };

        const token = notifierConfig.github?.token || process.env.GITHUB_TOKEN;
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        try {
            const response = await fetch(url, {
                headers,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (process.env.NODE_ENV === 'production') {
                    console.warn(`⚠️ [StartupNotifier] GitHub API [${response.status}] pour ${url}`);
                }
                return null;
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (process.env.NODE_ENV === 'production') {
                console.warn(`⚠️ [StartupNotifier] Erreur connexion GitHub API (${url}):`, error.message);
            }
            return null;
        }
    }

    cleanCommitMessage(msg) {
        if (!msg) return 'Aucun message de commit';
        const firstLine = msg.split('\n')[0].trim();
        return firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
    }

    /**
     * Envoie la notification de démarrage ou de mise à jour sur le salon Discord
     */
    async sendStartupNotification(client, force = false, guildId = null) {
        let notifierConfig = await this.getConfig(guildId);

        // Si aucun salon n'est configuré et qu'aucune guilde n'est spécifiée, on cherche si une guilde a un salon configuré
        if (!notifierConfig.channel_id && !guildId && client?.guilds?.cache) {
            for (const [gId] of client.guilds.cache) {
                const gConfig = await this.getConfig(gId);
                if (gConfig.enabled !== false && gConfig.channel_id) {
                    notifierConfig = gConfig;
                    guildId = gId;
                    break;
                }
            }
        }

        if (notifierConfig.enabled === false && !force) {
            console.log('ℹ️ [StartupNotifier] Notifications de démarrage désactivées dans la configuration.');
            return { sent: false, reason: 'disabled' };
        }

        const channelId = notifierConfig.channel_id || process.env.LOG_CHANNEL_ID;
        if (!channelId) {
            console.log('ℹ️ [StartupNotifier] Aucun salon de notification configuré.');
            return { sent: false, reason: 'no_channel' };
        }

        const repo = notifierConfig.github?.repo || process.env.GITHUB_REPO || 'sinteam-bot/chienne-bot';
        const repoUrl = `https://github.com/${repo}`;

        console.log('🔄 [StartupNotifier] Vérification des modifications et version de démarrage...');

        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                console.warn(`⚠️ [StartupNotifier] Salon introuvable ou non textuel (${channelId})`);
                return { sent: false, reason: 'invalid_channel' };
            }

            const currentCommit = this.getCurrentCommitInfo();
            const lastNotifiedCommit = await getBotState('last_notified_commit');
            let latestCommits = [];
            let comparison = null;
            let isUpdate = false;
            let effectiveSha = currentCommit.sha;

            // 1. Récupération des commits récents (Priorité GitHub API avec fallback Git local)
            const githubCommits = await this.fetchGithubApi('/commits?per_page=5');
            if (Array.isArray(githubCommits) && githubCommits.length > 0) {
                latestCommits = githubCommits;
                if (!effectiveSha) {
                    effectiveSha = githubCommits[0].sha;
                }
            } else {
                // Fallback Git local (dev local / offline / rate limit)
                const localCommits = this.getLocalGitCommits(5);
                if (localCommits.length > 0) {
                    latestCommits = localCommits;
                    if (!effectiveSha) {
                        effectiveSha = localCommits[0].sha;
                    }
                }
            }

            // 2. Détection de mise à jour
            if (lastNotifiedCommit && effectiveSha && lastNotifiedCommit !== effectiveSha) {
                isUpdate = true;
                const comp = await this.fetchGithubApi(`/compare/${lastNotifiedCommit}...${effectiveSha}`);
                if (comp && Array.isArray(comp.commits)) {
                    comparison = comp;
                } else {
                    // Fallback comparaison locale Git
                    const diffCommits = this.getLocalGitCommits(10, lastNotifiedCommit);
                    if (diffCommits.length > 0) {
                        comparison = {
                            commits: diffCommits,
                            html_url: `${repoUrl}/compare/${lastNotifiedCommit}...${effectiveSha}`
                        };
                    }
                }
            }

            // Si l'option "notify_on_update_only" est activée et qu'il ne s'agit pas d'une mise à jour ni d'un envoi forcé
            if (notifierConfig.notify_on_update_only && !isUpdate && !force) {
                console.log('ℹ️ [StartupNotifier] Pas de nouvelle mise à jour détectée (notify_on_update_only = true). Notification ignorée.');
                return { sent: false, reason: 'skipped_no_update' };
            }

            // 3. Construction de l'embed
            const embedColor = notifierConfig.embed_color || '#f2c7ce';
            const embed = new EmbedBuilder().setTimestamp();
            const shortSha = effectiveSha ? effectiveSha.substring(0, 7) : 'inconnu';
            const commitUrl = effectiveSha ? `${repoUrl}/commit/${effectiveSha}` : repoUrl;
            const isDocker = Boolean(process.env.BUILD_DATE || process.env.GIT_COMMIT_SHA || currentCommit.source === 'docker-env');

            if (isUpdate) {
                embed.setColor(embedColor)
                    .setTitle('🚀 Mise à jour déployée - Bot')
                    .setDescription(
                        `Le bot a redémarré avec de nouveaux changements !\n\n` +
                        `🔗 **Dépôt :** [${repo}](${repoUrl})\n` +
                        `📦 **Nouvelle version :** [\`${shortSha}\`](${commitUrl})`
                    );

                let commitsToShow = [];
                if (comparison && Array.isArray(comparison.commits) && comparison.commits.length > 0) {
                    commitsToShow = comparison.commits.slice(-5).reverse();
                } else if (latestCommits.length > 0) {
                    commitsToShow = latestCommits.slice(0, 5);
                }

                if (commitsToShow.length > 0 && notifierConfig.include_git_history !== false) {
                    const commitLines = commitsToShow.map(c => {
                        const cSha = (c.sha || '').substring(0, 7);
                        const cUrl = c.html_url || `${repoUrl}/commit/${c.sha}`;
                        const cAuthor = c.author?.login || c.commit?.author?.name || 'Inconnu';
                        const cMsg = this.cleanCommitMessage(c.commit?.message);
                        return `• [\`${cSha}\`](${cUrl}) **${cMsg}** (*par ${cAuthor}*)`;
                    });

                    embed.addFields({
                        name: `📝 Changements récents (${commitsToShow.length})`,
                        value: commitLines.join('\n')
                    });
                }

                if (comparison?.html_url) {
                    embed.addFields({
                        name: '🔍 Comparaison complète',
                        value: `[Voir le diff sur GitHub](${comparison.html_url})`
                    });
                }
            } else {
                embed.setColor(embedColor)
                    .setTitle('🤖 Démarrage du bot')
                    .setDescription(
                        `Le bot est en ligne et opérationnel.\n\n` +
                        `🔗 **Dépôt :** [${repo}](${repoUrl})\n` +
                        `📦 **Version active :** [\`${shortSha}\`](${commitUrl})`
                    );

                if (latestCommits.length > 0 && notifierConfig.include_git_history !== false) {
                    const commitLines = latestCommits.slice(0, 3).map(c => {
                        const cSha = (c.sha || '').substring(0, 7);
                        const cUrl = c.html_url || `${repoUrl}/commit/${c.sha}`;
                        const cAuthor = c.author?.login || c.commit?.author?.name || 'Inconnu';
                        const cMsg = this.cleanCommitMessage(c.commit?.message);
                        return `• [\`${cSha}\`](${cUrl}) **${cMsg}** (*par ${cAuthor}*)`;
                    });

                    embed.addFields({
                        name: '📌 Derniers commits du dépôt',
                        value: commitLines.join('\n')
                    });
                }
            }

            const envLabel = isDocker ? '🐳 Docker (Production)' : '💻 Local / Développement';
            embed.addFields(
                {
                    name: '⚙️ Environnement',
                    value: envLabel,
                    inline: true
                },
                {
                    name: '⏱️ Démarrage',
                    value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                    inline: true
                }
            );

            if (client.user) {
                embed.setThumbnail(client.user.displayAvatarURL({ dynamic: true }));
                embed.setFooter({
                    text: `${client.user.username} • Suivi des versions`,
                    iconURL: client.user.displayAvatarURL()
                });
            }

            await channel.send({ embeds: [embed] });
            console.log(`✅ [StartupNotifier] Notification envoyée dans le salon ${channelId}`);

            if (effectiveSha) {
                await setBotState('last_notified_commit', effectiveSha);
            }
            await setBotState('last_startup_at', new Date().toISOString());

            return { sent: true, isUpdate, version: shortSha, channelId };

        } catch (error) {
            console.error('❌ [StartupNotifier] Erreur lors de la notification:', error);
            return { sent: false, error: error.message };
        }
    }

    async getStatus(guildId = null) {
        const commitInfo = this.getCurrentCommitInfo();
        const lastNotified = await getBotState('last_notified_commit');
        const lastStartup = await getBotState('last_startup_at');
        const conf = await this.getConfig(guildId);

        let latestCommits = [];
        const githubCommits = await this.fetchGithubApi('/commits?per_page=5');
        if (Array.isArray(githubCommits) && githubCommits.length > 0) {
            latestCommits = githubCommits.map(c => ({
                sha: (c.sha || '').substring(0, 7),
                fullSha: c.sha,
                author: c.author?.login || c.commit?.author?.name || 'Inconnu',
                message: this.cleanCommitMessage(c.commit?.message),
                date: c.commit?.author?.date || null,
                url: c.html_url
            }));
        } else {
            const local = this.getLocalGitCommits(5);
            latestCommits = local.map(c => ({
                sha: (c.sha || '').substring(0, 7),
                fullSha: c.sha,
                author: c.author?.login || c.commit?.author?.name || 'Inconnu',
                message: this.cleanCommitMessage(c.commit?.message),
                date: c.commit?.author?.date || null,
                url: c.html_url
            }));
        }

        return {
            enabled: conf.enabled !== false,
            channelId: conf.channel_id || null,
            notifyOnUpdateOnly: conf.notify_on_update_only ?? false,
            includeGitHistory: conf.include_git_history ?? true,
            embedColor: conf.embed_color || '#f2c7ce',
            githubRepo: conf.github?.repo || process.env.GITHUB_REPO || 'sinteam-bot/chienne-bot',
            currentSha: commitInfo.sha,
            shortSha: commitInfo.sha ? commitInfo.sha.substring(0, 7) : null,
            source: commitInfo.source,
            lastNotifiedCommit: lastNotified || null,
            lastStartupAt: lastStartup || null,
            latestCommits
        };
    }
}

Injectable()(StartupNotifierService);

module.exports = {
    StartupNotifierService
};
