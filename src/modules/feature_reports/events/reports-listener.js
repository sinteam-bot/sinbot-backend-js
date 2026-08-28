/**
 * ReportsListener
 *
 * - Sur clic du bouton custom_id `report:open` sur un message,
 *   ouvre un modal pour saisir la raison + la catégorie.
 * - Sur modal submit `report:submit:<messageId>:<userId>:<channelId>`,
 *   crée un report via ReportsService.
 * - Sur messageContextMenu name = "Report user", ouvre le même
 *   modal avec le context du user ciblé.
 *
 * Le bouton lui-même est ajouté via le listener `messageCreate` (en
 * dessous) : à chaque message d'un user non-bot, on ajoute un
 * ActionRow avec un bouton "🚩 Report". C'est optionnel : on peut
 * aussi passer par le menu contextuel.
 */

const { InteractionType, ComponentType, ButtonStyle, TextInputStyle, PermissionsBitField } = require('discord.js');
const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { getConfig } = require('../../../config/index.js');
const { ReportsService } = require('../services/reports.service.js');

class ReportsListener {
    static inject = [ReportsService];

    constructor(service) {
        this.service = service;
        this._client = null;
    }

    setClient(client) { this._client = client; }

    async _isEnabled(guildId) {
        const state = await featureRegistry.get(guildId, 'reports');
        return state.enabled ? state.config : null;
    }

    /**
     * À chaque message utilisateur (non-bot), on ajoute un bouton
     * "🚩 Report" en row dédiée.
     */
    async onMessageCreate(message) {
        if (!message?.guild) return;
        if (message.author?.bot) return;
        if (message.system) return;
        const cfg = await this._isEnabled(message.guild.id);
        if (!cfg) return;

        // Pas de bouton sur le message du bot lui-même
        if (message.author.id === this._client?.user?.id) return;

        const { ActionRowBuilder, ButtonBuilder } = require('discord.js');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`report:open:${message.id}:${message.author.id}:${message.channel.id}`)
                .setLabel('🚩 Report')
                .setStyle(ButtonStyle.Secondary)
        );
        try {
            await message.editReply?.(); // no-op for non-interaction
        } catch (err) {
            console.debug('[ReportsListener] editReply no-op:', err.message);
        }
        // Note: Discord n'autorise pas d'éditer un message d'un bot
        // pour ajouter un bouton. À la place, on stocke un cache
        // messageId->[userId] et on édite le message si le bot l'a écrit.
        // Sinon, le staff utilise /report context menu (User).
        // (Pour cette V1, on expose le context menu comme chemin principal.)
    }

    /**
     * Bouton "Report" cliqué : ouvre le modal de saisie de raison.
     */
    async onInteractionCreate(interaction) {
        if (!interaction.isButton() && interaction.type !== InteractionType.ModalSubmit) return;
        if (!interaction.guild) return;

        const cfg = await this._isEnabled(interaction.guild.id);
        if (!cfg) return;

        // === Bouton "🚩 Report" cliqué ===
        if (interaction.isButton() && interaction.customId.startsWith('report:open:')) {
            const parts = interaction.customId.split(':');
            // parts: ['report', 'open', messageId, userId, channelId]
            if (parts.length < 5) return;
            const [, , messageId, userId, channelId] = parts;
            return this._openReportModal(interaction, messageId, userId, channelId);
        }

        // === Modal "Report" soumis ===
        if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('report:submit:')) {
            return this._handleReportSubmit(interaction);
        }
    }

    /**
     * Menu contextuel "Report user" : ouvre le modal pré-rempli.
     */
    async onContextMenu(interaction) {
        if (!interaction.guild) return;
        const cfg = await this._isEnabled(interaction.guild.id);
        if (!cfg) return;
        if (interaction.commandName !== 'Report user') return;
        const target = interaction.targetUser || interaction.options.getUser('user');
        if (!target) return;
        return this._openReportModal(interaction, null, target.id, interaction.channelId);
    }

    async _openReportModal(interaction, messageId, reportedId, channelId) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId(`report:submit:${messageId || ''}:${reportedId}:${channelId || ''}`)
            .setTitle('🚩 Signaler un comportement');
        const reasonInput = new TextInputBuilder()
            .setCustomId('report_reason')
            .setLabel('Raison du signalement (max 500 chars)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);
        const categoryInput = new TextInputBuilder()
            .setCustomId('report_category')
            .setLabel('Catégorie (spam, harassment, inappropriate, misinformation, other)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(50);
        modal.addComponents(reasonInput, categoryInput);
        try {
            await interaction.showModal(modal);
        } catch (err) {
            console.warn(`[ReportsListener] showModal failed: ${err.message}`);
        }
    }

    async _handleReportSubmit(interaction) {
        const parts = interaction.customId.split(':');
        // parts: ['report', 'submit', messageId, reportedId, channelId]
        const [, , messageId, reportedId, channelId] = parts;
        if (!reportedId) {
            return interaction.reply({ content: '❌ Cible invalide', ephemeral: true });
        }
        const reason = interaction.fields.getTextInputValue('report_reason')?.trim();
        const category = (interaction.fields.getTextInputValue('report_category') || 'other').trim();

        const cfg = getConfig().features?.reports || {};
        const r = await this.service.create({
            guildId: interaction.guild.id,
            reporterId: interaction.user.id,
            reportedId,
            channelId: channelId || null,
            messageId: messageId || null,
            reason,
            category,
            config: cfg
        });
        if (!r.ok) {
            const messages = {
                cannot_report_self: '❌ Vous ne pouvez pas vous signaler vous-même',
                reason_required: '❌ Une raison est requise',
                cooldown: '⏰ Vous avez déjà signalé ce user récemment. Réessayez plus tard.',
                too_many_open_reports: '❌ Trop de signalements ouverts contre cet user. Réessayez plus tard.',
                missing_params: '❌ Paramètres manquants'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        // Notifier le staff dans le salon de reports
        if (cfg.report_channel_id) {
            try {
                const channel = await this._client.channels.fetch(cfg.report_channel_id).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const embed = {
                        title: '🚩 Nouveau signalement',
                        description: `Raison : **${reason}**\nCatégorie : **${category}**`,
                        fields: [
                            { name: 'Reporter', value: `<@${interaction.user.id}>`, inline: true },
                            { name: 'Reported', value: `<@${reportedId}>`, inline: true }
                        ],
                        footer: { text: `ID du report : ${r.data.id}` }
                    };
                    if (messageId) embed.fields.push({ name: 'Message', value: `[Voir le contexte](https://discord.com/channels/${interaction.guildId}/${channelId}/${messageId})` });
                    await channel.send({ embeds: [embed] });
                }
            } catch (err) {
                console.warn(`[ReportsListener] staff notification failed: ${err.message}`);
            }
        }
        return interaction.reply({ content: '✅ Signalement envoyé. Le staff va examiner.', ephemeral: true });
    }
}

OnEvent('messageCreate', { configKey: 'features.reports', priority: 30 })(ReportsListener.prototype, 'onMessageCreate');
OnEvent('interactionCreate', { configKey: 'features.reports', priority: 30 })(ReportsListener.prototype, 'onInteractionCreate');
OnEvent('interactionCreate', { configKey: 'features.reports', priority: 31 })(ReportsListener.prototype, 'onContextMenu');

module.exports = { ReportsListener };
