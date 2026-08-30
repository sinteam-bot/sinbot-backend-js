/**
 * src/modules/community_confessions/events/interaction-create.listener.js
 *
 * Listener interactionCreate pour les boutons d'approbation/rejet de confessions staff.
 */

const { PermissionFlagsBits } = require('discord.js');
const { OnEvent, getConfig } = require('../../../core/index.js');
const { ConfessionsService } = require('../services/confessions.service.js');

class ConfessionInteractionListener {
    static inject = [ConfessionsService];

    constructor(service) {
        this.service = service;
    }

    _getConfig() {
        return getConfig().features?.confessions || {};
    }

    async handle(interaction) {
        if (!interaction.isButton()) return;
        const customId = interaction.customId;

        if (customId.startsWith('confession:approve:')) {
            if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
                !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Réservé aux modérateurs.', ephemeral: true });
            }

            const id = customId.replace('confession:approve:', '');
            const cfg = this._getConfig();
            const res = await this.service.approveConfession(id, interaction.user.username, cfg, interaction.client);

            if (!res.ok) {
                return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
            }

            return interaction.reply({ content: `✅ Confession #${res.data.number} approuvée et publiée.`, ephemeral: true });
        }

        if (customId.startsWith('confession:reject:')) {
            if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages) &&
                !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Réservé aux modérateurs.', ephemeral: true });
            }

            const id = customId.replace('confession:reject:', '');
            const cfg = this._getConfig();
            const res = await this.service.rejectConfession(id, interaction.user.username, cfg, interaction.client);

            if (!res.ok) {
                return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
            }

            return interaction.reply({ content: `❌ Confession rejetée.`, ephemeral: true });
        }
    }
}

OnEvent('interactionCreate')(ConfessionInteractionListener.prototype, 'handle');

module.exports = { ConfessionInteractionListener };
