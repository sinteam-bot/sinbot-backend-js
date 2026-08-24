const { EmbedBuilder } = require('discord.js');
const { execSync } = require('child_process');
const { Injectable } = require('../../core/index.js');
const { config, getConfig } = require('../../config/index.js');
const { getBotState, setBotState } = require('../../database.js');

class StartupNotifierService {
    constructor() {}

    getConfig() {
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
                console.warn(`⚠️ [StartupNotifier] GitHub API [${response.status}] pour ${url}`);
                return null;
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            console.warn(`⚠️ [StartupNotifier] Erreur connexion GitHub API (${url}):`, error.message);
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
    async sendStartupNotification(client, force = false) {
        const notifierConfig = this.getConfig();
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
            const channel = await client.channels.fetch(channelId);
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

            // 1. Récupération des commits récents
            const githubCommits = await this.fetchGithubApi('/commits?per_page=5');
            if (Array.isArray(githubCommits) && githubCommits.length > 0) {
                latestCommits = githubCommits;
                if (!effectiveSha) {
                    effectiveSha = githubCommits[0].sha;
                }
            }

            // 2. Détection de mise à jour
            if (lastNotifiedCommit && effectiveSha && lastNotifiedCommit !== effectiveSha) {
                isUpdate = true;
                comparison = await this.fetchGithubApi(`/compare/${lastNotifiedCommit}...${effectiveSha}`);
            }

            // 3. Construction de l'embed
            const embed = new EmbedBuilder().setTimestamp();
            const shortSha = effectiveSha ? effectiveSha.substring(0, 7) : 'inconnu';
            const commitUrl = effectiveSha ? `${repoUrl}/commit/${effectiveSha}` : repoUrl;
            const isDocker = Boolean(process.env.BUILD_DATE || process.env.GIT_COMMIT_SHA || currentCommit.source === 'docker-env');

            if (isUpdate) {
                embed.setColor('#f2c7ce')
                    .setTitle('🚀 Mise à jour déployée - Chienne Bot')
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

                if (commitsToShow.length > 0) {
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
                embed.setColor('#f2c7ce')
                    .setTitle('🤖 Démarrage du bot - Chienne Bot')
                    .setDescription(
                        `Le bot est en ligne et opérationnel.\n\n` +
                        `🔗 **Dépôt :** [${repo}](${repoUrl})\n` +
                        `📦 **Version active :** [\`${shortSha}\`](${commitUrl})`
                    );

                if (latestCommits.length > 0) {
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

            return { sent: true, isUpdate, version: shortSha };

        } catch (error) {
            console.error('❌ [StartupNotifier] Erreur lors de la notification:', error);
            return { sent: false, error: error.message };
        }
    }

    async getStatus() {
        const commitInfo = this.getCurrentCommitInfo();
        const lastNotified = await getBotState('last_notified_commit');
        const lastStartup = await getBotState('last_startup_at');
        const conf = this.getConfig();

        return {
            enabled: conf.enabled !== false,
            channelId: conf.channel_id || null,
            currentSha: commitInfo.sha,
            source: commitInfo.source,
            lastNotifiedCommit: lastNotified || null,
            lastStartupAt: lastStartup || null
        };
    }
}

Injectable()(StartupNotifierService);

module.exports = {
    StartupNotifierService
};
