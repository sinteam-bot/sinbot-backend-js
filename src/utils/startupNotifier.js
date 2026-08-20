const { EmbedBuilder } = require('discord.js');
const { execSync } = require('child_process');
const { getBotState, setBotState } = require('../database.js');

/**
 * Récupère le SHA du commit courant depuis l'environnement Docker ou Git local
 */
function getCurrentCommitInfo() {
    // 1. Variable d'environnement (injectée lors du build Docker ou via .env)
    let sha = process.env.GIT_COMMIT_SHA;
    if (sha && sha !== 'dev' && sha !== '') {
        return {
            sha: sha.trim(),
            source: 'docker-env'
        };
    }

    // 2. Si non présent ou en dev, tenter de lire via git local si disponible
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
        // Git non installé ou hors d'un dépôt git (.dockerignore)
    }

    return {
        sha: null,
        source: 'unknown'
    };
}

/**
 * Effectue un appel sécurisé vers l'API GitHub avec gestion d'erreurs et timeout
 */
async function fetchGithubApi(endpoint) {
    const repo = process.env.GITHUB_REPO || 'sinteam-bot/chienne-bot';
    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com/repos/${repo}${endpoint}`;

    const headers = {
        'User-Agent': 'chienne-bot-discord',
        'Accept': 'application/vnd.github+json'
    };

    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
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
            console.warn(`⚠️ GitHub API [${response.status}] pour ${url}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        console.warn(`⚠️ Erreur de connexion à l'API GitHub (${url}):`, error.message);
        return null;
    }
}

/**
 * Formate un message de commit pour l'affichage Discord (première ligne tronquée si besoin)
 */
function cleanCommitMessage(msg) {
    if (!msg) return 'Aucun message de commit';
    const firstLine = msg.split('\n')[0].trim();
    return firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
}

/**
 * Vérifie l'état de version au démarrage et envoie une notification dans le salon Discord
 * @param {import('discord.js').Client} client
 */
async function checkAndSendStartupNotification(client) {
    const channelId = process.env.NOTIFICATION_CHANNEL_ID || '1533492760697503805';
    const repo = process.env.GITHUB_REPO || 'sinteam-bot/chienne-bot';
    const repoUrl = `https://github.com/${repo}`;

    console.log('🔄 Vérification des modifications et version de démarrage...');

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            console.warn(`⚠️ Salon de notification introuvable ou non textuel (${channelId})`);
            return;
        }

        const currentCommit = getCurrentCommitInfo();
        const lastNotifiedCommit = await getBotState('last_notified_commit');
        let latestCommits = [];
        let comparison = null;
        let isUpdate = false;
        let effectiveSha = currentCommit.sha;

        // 1. Récupération des derniers commits depuis GitHub
        const githubCommits = await fetchGithubApi('/commits?per_page=5');
        if (Array.isArray(githubCommits) && githubCommits.length > 0) {
            latestCommits = githubCommits;
            if (!effectiveSha) {
                effectiveSha = githubCommits[0].sha;
            }
        }

        // 2. Détermination de la mise à jour
        if (lastNotifiedCommit && effectiveSha && lastNotifiedCommit !== effectiveSha) {
            isUpdate = true;
            // Tenter de comparer les deux versions via GitHub Compare API
            comparison = await fetchGithubApi(`/compare/${lastNotifiedCommit}...${effectiveSha}`);
        } else if (!lastNotifiedCommit) {
            // Premier démarrage avec ce système
            isUpdate = false;
        }

        // 3. Construction de l'embed
        const embed = new EmbedBuilder().setTimestamp();

        const shortSha = effectiveSha ? effectiveSha.substring(0, 7) : 'inconnu';
        const commitUrl = effectiveSha ? `${repoUrl}/commit/${effectiveSha}` : repoUrl;
        const isDocker = Boolean(process.env.BUILD_DATE || process.env.GIT_COMMIT_SHA || currentCommit.source === 'docker-env');

        if (isUpdate) {
            embed.setColor('#57F287') // Vert vif
                .setTitle('🚀 Mise à jour déployée - Chienne Bot')
                .setDescription(
                    `Le bot a redémarré avec de nouveaux changements !\n\n` +
                    `🔗 **Dépôt :** [${repo}](${repoUrl})\n` +
                    `📦 **Nouvelle version :** [\`${shortSha}\`](${commitUrl})`
                );

            // Liste des commits inclus dans la mise à jour
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
                    const cMsg = cleanCommitMessage(c.commit?.message);
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
            embed.setColor('#5865F2') // Bleu Blurple Discord
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
                    const cMsg = cleanCommitMessage(c.commit?.message);
                    return `• [\`${cSha}\`](${cUrl}) **${cMsg}** (*par ${cAuthor}*)`;
                });

                embed.addFields({
                    name: '📌 Derniers commits du dépôt',
                    value: commitLines.join('\n')
                });
            }
        }

        // Informations techniques
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

        // 4. Envoi du message dans le salon Discord
        await channel.send({ embeds: [embed] });
        console.log(`✅ Notification de démarrage envoyée dans le salon ${channelId}`);

        // 5. Sauvegarde de l'état en base de données
        if (effectiveSha) {
            await setBotState('last_notified_commit', effectiveSha);
        }
        await setBotState('last_startup_at', new Date().toISOString());

    } catch (error) {
        console.error('❌ Erreur lors de la notification de démarrage:', error);
    }
}

module.exports = {
    checkAndSendStartupNotification,
    getCurrentCommitInfo,
    fetchGithubApi
};
