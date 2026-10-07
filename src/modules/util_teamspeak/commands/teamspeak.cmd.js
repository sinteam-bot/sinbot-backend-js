/**
 * src/modules/util_teamspeak/commands/teamspeak.cmd.js
 *
 * Commandes Slash /teamspeak (tree, status, widget, logs).
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');
const { Command } = require('../../../core/index.js');
const { TeamSpeakClientService } = require('../services/teamspeak-client.service.js');
const { TeamSpeakTreeService } = require('../services/teamspeak-tree.service.js');
const { TeamSpeakWidgetService } = require('../services/teamspeak-widget.service.js');
const { TeamSpeakLogsService } = require('../services/teamspeak-logs.service.js');
const { setFeatureConfig, getFeatureConfig } = require('../../../config/c12-loader.js');

class TeamSpeakCommands {
    static inject = [
        TeamSpeakClientService,
        TeamSpeakTreeService,
        TeamSpeakWidgetService,
        TeamSpeakLogsService
    ];

    constructor(clientService, treeService, widgetService, logsService) {
        this.clientService = clientService;
        this.treeService = treeService;
        this.widgetService = widgetService;
        this.logsService = logsService;
    }

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'tree':
                return this.executeTree(interaction);
            case 'status':
                return this.executeStatus(interaction);
            case 'widget':
                return this.executeWidget(interaction);
            case 'logs':
                return this.executeLogs(interaction);
            default:
                return interaction.reply({ content: '❌ Sous-commande non reconnue.', ephemeral: true });
        }
    }

    /**
     * Affiche l'arborescence complète des salons et clients.
     */
    async executeTree(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemere') ?? false;
        const hideEmpty = interaction.options.getBoolean('masquer_vides') ?? false;

        await interaction.deferReply({ ephemeral });

        // Actualiser l'état
        await this.clientService.refreshCache().catch(() => {});

        const data = this.clientService.getTreeData();
        const treeResult = this.treeService.buildTree(data.channels, data.clients, {
            hideEmptyChannels: hideEmpty
        });

        const embed = this.treeService.buildDiscordEmbed(treeResult, data.serverInfo, {
            hideEmptyChannels: hideEmpty
        });
        const row = this.treeService.buildActionRow(interaction.guildId, data.serverInfo);

        return interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    }

    /**
     * Affiche le statut technique de la connexion au serveur TS3.
     */
    async executeStatus(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const isOnline = this.clientService.isConnected();
        const info = this.clientService.getServerInfo();
        const channelsCount = this.clientService._channels.length;
        const clientsCount = this.clientService._clients.filter(c => c.type !== 1).length;

        const embed = new EmbedBuilder()
            .setTitle(`🔊 État du serveur TeamSpeak 3`)
            .setColor(isOnline ? 0x57F287 : 0xED4245)
            .addFields(
                { name: 'Statut', value: isOnline ? '🟢 Connecté' : '🔴 Déconnecté', inline: true },
                { name: 'Nom du serveur', value: info.name || 'N/A', inline: true },
                { name: 'Adresse', value: `\`${info.host}:${info.port || 9987}\``, inline: true },
                { name: 'Utilisateurs en ligne', value: `${clientsCount} / ${info.maxClients || 32}`, inline: true },
                { name: 'Salons', value: `${channelsCount}`, inline: true },
                { name: 'Version TS3', value: info.version || 'Inconnue', inline: true }
            )
            .setTimestamp();

        if (info.uptime && info.uptime > 0) {
            const days = Math.floor(info.uptime / 86400);
            const hours = Math.floor((info.uptime % 86400) / 3600);
            embed.addFields({ name: 'Uptime', value: `${days}j ${hours}h`, inline: true });
        }

        return interaction.editReply({ embeds: [embed] });
    }

    /**
     * Configuration et gestion du widget en direct.
     */
    async executeWidget(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '⛔ Vous devez avoir la permission **Gérer le serveur** pour configurer le widget.',
                ephemeral: true
            });
        }

        const action = interaction.options.getString('action');
        const channel = interaction.options.getChannel('salon');
        const guildId = interaction.guildId;

        await interaction.deferReply({ ephemeral: true });

        if (action === 'setup') {
            if (!channel) {
                return interaction.editReply({ content: '❌ Veuillez spécifier un salon Discord pour le widget.' });
            }

            // Mettre à jour la configuration
            await setFeatureConfig(guildId, 'teamspeak', {
                enabled: true,
                widget: {
                    enabled: true,
                    channel_id: channel.id,
                    message_id: null
                }
            });

            // S'assurer que le client est transmis au widgetService
            this.widgetService.setClient(interaction.client);

            // Créer le widget dans le salon
            const res = await this.widgetService.updateWidget(guildId);
            if (res.ok) {
                return interaction.editReply({
                    content: `✅ Widget TeamSpeak 3 déployé avec succès dans <#${channel.id}> ! Il s'actualisera automatiquement.`
                });
            } else {
                return interaction.editReply({
                    content: `⚠️ Configuration sauvegardée, mais erreur lors de la création du widget : ${res.error}`
                });
            }
        }

        if (action === 'refresh') {
            this.widgetService.setClient(interaction.client);
            const res = await this.widgetService.refreshNow(guildId);
            if (res.ok) {
                return interaction.editReply({ content: '✅ Widget TeamSpeak 3 actualisé avec succès !' });
            } else {
                return interaction.editReply({ content: `❌ Impossible d'actualiser le widget : ${res.error}` });
            }
        }

        if (action === 'delete') {
            await setFeatureConfig(guildId, 'teamspeak', {
                widget: {
                    enabled: false,
                    channel_id: null,
                    message_id: null
                }
            });
            return interaction.editReply({ content: '✅ Le widget TeamSpeak 3 a été désactivé pour ce serveur.' });
        }

        return interaction.editReply({ content: '❌ Action inconnue.' });
    }

    /**
     * Configuration des logs d'actions TeamSpeak 3.
     */
    async executeLogs(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '⛔ Vous devez avoir la permission **Gérer le serveur** pour configurer les logs.',
                ephemeral: true
            });
        }

        const action = interaction.options.getString('action');
        const channel = interaction.options.getChannel('salon');
        const guildId = interaction.guildId;

        await interaction.deferReply({ ephemeral: true });

        if (action === 'setup') {
            if (!channel) {
                return interaction.editReply({ content: '❌ Veuillez spécifier un salon pour recevoir les logs.' });
            }

            await setFeatureConfig(guildId, 'teamspeak', {
                enabled: true,
                logs: {
                    enabled: true,
                    channel_id: channel.id
                }
            });

            this.logsService.setConfig({
                enabled: true,
                channel_id: channel.id
            });
            this.logsService.setClient(interaction.client);

            return interaction.editReply({
                content: `✅ Salon de logs TeamSpeak 3 configuré sur <#${channel.id}>. Les connexions, déconnexions et déplacements y seront affichés.`
            });
        }

        if (action === 'disable') {
            await setFeatureConfig(guildId, 'teamspeak', {
                logs: {
                    enabled: false,
                    channel_id: null
                }
            });

            this.logsService.setConfig({
                enabled: false,
                channel_id: null
            });

            return interaction.editReply({ content: '✅ Les logs Discord TeamSpeak 3 ont été désactivés.' });
        }

        return interaction.editReply({ content: '❌ Action inconnue.' });
    }
}

const teamspeakBuilder = new SlashCommandBuilder()
    .setName('teamspeak')
    .setDescription('Module TeamSpeak 3 : widget arborescence et logs Discord')
    .addSubcommand(sub =>
        sub.setName('tree')
            .setDescription('Afficher l’arborescence des salons et des utilisateurs TeamSpeak')
            .addBooleanOption(opt =>
                opt.setName('ephemere')
                    .setDescription('Afficher uniquement pour vous (défaut: non)')
                    .setRequired(false)
            )
            .addBooleanOption(opt =>
                opt.setName('masquer_vides')
                    .setDescription('Masquer les salons sans utilisateurs (défaut: non)')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('status')
            .setDescription('Afficher l’état et les informations techniques du serveur TeamSpeak 3')
    )
    .addSubcommand(sub =>
        sub.setName('widget')
            .setDescription('Gérer le widget interactif persistant dans un salon Discord')
            .addStringOption(opt =>
                opt.setName('action')
                    .setDescription('Action à effectuer')
                    .setRequired(true)
                    .addChoices(
                        { name: '✨ Installer / Déployer', value: 'setup' },
                        { name: '🔄 Forcer l’actualisation', value: 'refresh' },
                        { name: '🗑️ Désactiver / Supprimer', value: 'delete' }
                    )
            )
            .addChannelOption(opt =>
                opt.setName('salon')
                    .setDescription('Salon où afficher le widget (requis pour installer)')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('logs')
            .setDescription('Configurer le salon de réception des logs TeamSpeak 3')
            .addStringOption(opt =>
                opt.setName('action')
                    .setDescription('Action à effectuer')
                    .setRequired(true)
                    .addChoices(
                        { name: '📜 Configurer le salon', value: 'setup' },
                        { name: '🛑 Désactiver les logs Discord', value: 'disable' }
                    )
            )
            .addChannelOption(opt =>
                opt.setName('salon')
                    .setDescription('Salon de destination des logs (requis pour configurer)')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setRequired(false)
            )
    );

Command({ name: 'teamspeak', builder: teamspeakBuilder })(TeamSpeakCommands.prototype, 'execute');

module.exports = { TeamSpeakCommands };
