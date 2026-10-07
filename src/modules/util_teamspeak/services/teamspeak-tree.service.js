/**
 * src/modules/util_teamspeak/services/teamspeak-tree.service.js
 *
 * Service de construction et de formatage de l'arborescence des salons et utilisateurs TeamSpeak 3.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Injectable } = require('../../../core/index.js');

class TeamSpeakTreeService {
    static inject = [];

    /**
     * Nettoie et formate les noms de salons TS3 avec spacers.
     * @param {string} rawName
     * @returns {string}
     */
    cleanChannelName(rawName) {
        if (!rawName) return '';

        // Spacer répétitif : [*spacer0]--- ou [*spacer]===
        const repeatMatch = rawName.match(/^\[\*spacer\d*\](.*)$/);
        if (repeatMatch) {
            const pattern = repeatMatch[1] || '─';
            const rep = pattern.repeat(Math.max(1, Math.floor(15 / Math.max(1, pattern.length))));
            return `─── ${rep} ───`;
        }

        // Spacer centré : [cspacer0]Titre
        const centerMatch = rawName.match(/^\[cspacer\d*\](.*)$/);
        if (centerMatch) {
            return `── ${centerMatch[1].trim()} ──`;
        }

        // Spacer aligné gauche/droite : [lspacer] / [rspacer]
        const sideMatch = rawName.match(/^\[[lr]spacer\d*\](.*)$/);
        if (sideMatch) {
            return `── ${sideMatch[1].trim()}`;
        }

        // Spacer simple : [spacer0]Titre
        const simpleSpacer = rawName.match(/^\[spacer\d*\](.*)$/);
        if (simpleSpacer) {
            return simpleSpacer[1].trim();
        }

        return rawName;
    }

    /**
     * Formate les statuts visuels d'un utilisateur (away, mute, etc.).
     * @param {Object} client
     * @returns {string}
     */
    formatClientStatus(client) {
        const flags = [];

        // Casque muet (output muted)
        if (client.outputMuted || client.clientOutputMuted) {
            flags.push('🔇');
        } else if (client.inputMuted || client.clientInputMuted) {
            // Micro muet uniquement
            flags.push('🎙️❌');
        }

        // Absent / Away
        const isAway = Boolean(client.away || client.clientAway);
        if (isAway) {
            const msg = client.awayMessage || client.clientAwayMessage;
            flags.push(msg ? `💤 [${msg}]` : '💤 [Absent]');
        }

        return flags.length > 0 ? ` ${flags.join(' ')}` : '';
    }

    /**
     * Construit l'arborescence hiérarchique des salons et de leurs utilisateurs.
     * @param {Array<Object>} channels Liste brute des salons TS3
     * @param {Array<Object>} clients Liste brute des clients TS3
     * @param {Object} [options]
     * @returns {{ rootChannels: Array<Object>, channelCount: number, clientCount: number, clients: Array<Object> }}
     */
    buildTree(channels = [], clients = [], options = {}) {
        const showQueryClients = Boolean(options.showQueryClients);
        const hideEmptyChannels = Boolean(options.hideEmptyChannels);

        // 1. Filtrer les clients (exclure les bots ServerQuery de type 1 par défaut)
        const filteredClients = clients.filter(c => {
            if (!c) return false;
            const type = c.type !== undefined ? c.type : c.clientType;
            if (!showQueryClients && Number(type) === 1) {
                return false;
            }
            return true;
        });

        // 2. Créer une map des salons avec leurs clients
        const channelMap = new Map();

        for (const ch of channels) {
            const cid = String(ch.cid);
            const pid = ch.pid !== undefined ? String(ch.pid) : '0';
            const rawName = ch.name || `Salon #${cid}`;
            const displayName = this.cleanChannelName(rawName);

            channelMap.set(cid, {
                cid: ch.cid,
                pid,
                name: rawName,
                displayName,
                order: Number(ch.order || ch.channelOrder || 0),
                totalClients: ch.totalClients || 0,
                clients: [],
                subchannels: []
            });
        }

        // 3. Associer les clients à leur salon respectif
        for (const client of filteredClients) {
            const cid = String(client.cid);
            const channel = channelMap.get(cid);
            if (channel) {
                channel.clients.push({
                    clid: client.clid,
                    cid: client.cid,
                    nickname: client.nickname || client.clientNickname || 'Anonyme',
                    type: client.type !== undefined ? client.type : client.clientType,
                    away: client.away || client.clientAway || 0,
                    awayMessage: client.awayMessage || client.clientAwayMessage || '',
                    outputMuted: Boolean(client.outputMuted || client.clientOutputMuted),
                    inputMuted: Boolean(client.inputMuted || client.clientInputMuted),
                    servergroups: client.servergroups || client.clientServergroups || []
                });
            }
        }

        // 4. Structurer l'arborescence (relier sous-salons aux parents)
        const rootChannels = [];

        for (const channel of channelMap.values()) {
            if (channel.pid === '0' || !channelMap.has(channel.pid)) {
                rootChannels.push(channel);
            } else {
                const parent = channelMap.get(channel.pid);
                parent.subchannels.push(channel);
            }
        }

        // 5. Trier les sous-salons par ordre TS3
        const sortNodes = (nodes) => {
            nodes.sort((a, b) => a.order - b.order);
            for (const n of nodes) {
                if (n.subchannels.length > 0) {
                    sortNodes(n.subchannels);
                }
            }
        };
        sortNodes(rootChannels);

        // 6. Optionnel : masquer les salons complètement vides
        if (hideEmptyChannels) {
            const filterEmpty = (node) => {
                node.subchannels = node.subchannels.filter(filterEmpty);
                const hasClients = node.clients.length > 0;
                const hasSubWithClients = node.subchannels.length > 0;
                return hasClients || hasSubWithClients;
            };
            return {
                rootChannels: rootChannels.filter(filterEmpty),
                channelCount: channels.length,
                clientCount: filteredClients.length,
                clients: filteredClients
            };
        }

        return {
            rootChannels,
            channelCount: channels.length,
            clientCount: filteredClients.length,
            clients: filteredClients
        };
    }

    /**
     * Rendu de l'arborescence en texte ASCII / Unicode lisible pour Discord.
     * @param {Array<Object>} nodes Salons racines
     * @param {Object} [options]
     * @returns {string}
     */
    formatAsciiTree(nodes = [], options = {}) {
        const showChannelIds = options.showChannelIds !== false;
        const lines = [];

        const renderChannel = (channel, prefix = '', isLast = true, isRoot = false) => {
            const marker = isRoot ? '📁 ' : (isLast ? '└── 📁 ' : '├── 📁 ');
            const idBadge = showChannelIds ? ` [${channel.cid}]` : '';
            lines.push(`${prefix}${marker}${channel.displayName}${idBadge}`);

            const childPrefix = isRoot ? ' ' : prefix + (isLast ? '    ' : '│   ');

            // Afficher les clients du salon
            const totalClients = channel.clients.length;
            const hasSubchannels = channel.subchannels.length > 0;

            channel.clients.forEach((client, idx) => {
                const isLastClient = (idx === totalClients - 1) && !hasSubchannels;
                const clientMarker = isLastClient ? '└── 👤 ' : '├── 👤 ';
                const status = this.formatClientStatus(client);
                lines.push(`${childPrefix}${clientMarker}${client.nickname}${status}`);
            });

            // Afficher les sous-salons
            channel.subchannels.forEach((sub, idx) => {
                const isLastSub = idx === channel.subchannels.length - 1;
                renderChannel(sub, childPrefix, isLastSub, false);
            });
        };

        nodes.forEach((root, idx) => {
            const isLast = idx === nodes.length - 1;
            renderChannel(root, '', isLast, true);
        });

        return lines.join('\n');
    }

    /**
     * Génère l'embed Discord représentant le widget d'arborescence TS3.
     * @param {Object} treeResult Résultat de buildTree
     * @param {Object} serverInfo Données serveur TS3
     * @param {Object} [options] Options d'affichage
     * @returns {EmbedBuilder}
     */
    buildDiscordEmbed(treeResult, serverInfo = {}, options = {}) {
        const color = options.color || '#2580EB';
        const parsedColor = typeof color === 'string'
            ? parseInt(color.replace('#', ''), 16) || 0x2580EB
            : color;

        const title = options.title || '🔊 Serveur TeamSpeak 3';
        const serverName = serverInfo.name || 'TeamSpeak 3 Server';
        const host = serverInfo.host || options.host || '127.0.0.1';
        const port = serverInfo.serverport || serverInfo.port || options.port || 9987;
        const maxClients = serverInfo.maxClients || serverInfo.virtualserver_maxclients || 32;
        const isOnline = serverInfo.online !== false;

        const embed = new EmbedBuilder()
            .setColor(parsedColor)
            .setTitle(title)
            .setTimestamp();

        if (!isOnline) {
            embed.setDescription(
                `🔴 **Statut : Hors ligne**\n` +
                `Impossible de joindre le serveur TeamSpeak sur \`${host}:${port}\`.\n` +
                `*Vérification automatique en cours...*`
            );
            embed.setFooter({ text: 'TeamSpeak 3 • Serveur inaccessible' });
            return embed;
        }

        const ascii = this.formatAsciiTree(treeResult.rootChannels, options);

        // Header d'informations
        const statusHeader =
            `🟢 **En ligne** • **${treeResult.clientCount} / ${maxClients}** clients connectés • **${treeResult.channelCount}** salons\n` +
            `🌐 **Adresse :** \`${host}:${port}\`\n\n`;

        // Tronquer élégamment si la taille totale dépasse la limite Discord (4096 car.)
        let treeBlock = '';
        if (ascii.trim().length === 0) {
            treeBlock = '*Aucun salon ou utilisateur à afficher.*';
        } else {
            const maxTreeLength = 3700 - statusHeader.length;
            if (ascii.length > maxTreeLength) {
                const truncated = ascii.slice(0, maxTreeLength);
                treeBlock = `\`\`\`text\n${truncated}\n... (arborescence tronquée)\n\`\`\``;
            } else {
                treeBlock = `\`\`\`text\n${ascii}\n\`\`\``;
            }
        }

        embed.setDescription(`${statusHeader}${treeBlock}`);
        embed.setFooter({ text: `TeamSpeak 3 • ${serverName}` });

        return embed;
    }

    /**
     * Génère les boutons d'action (Actualiser + Lien Rejoindre).
     * @param {string} guildId
     * @param {Object} [serverInfo]
     * @returns {ActionRowBuilder}
     */
    buildActionRow(guildId = 'default', serverInfo = {}) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ts3:refresh:${guildId}`)
                .setLabel('Actualiser')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
        );

        const joinUrl = serverInfo.joinUrl || serverInfo.webUrl || null;
        if (joinUrl && (joinUrl.startsWith('http://') || joinUrl.startsWith('https://'))) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel('Rejoindre TeamSpeak')
                    .setEmoji('🎧')
                    .setStyle(ButtonStyle.Link)
                    .setURL(joinUrl)
            );
        }

        return row;
    }
}

Injectable()(TeamSpeakTreeService);

module.exports = { TeamSpeakTreeService };
