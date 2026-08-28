/**
 * /reactionrole add|remove|list
 *
 *   /reactionrole add  channel:@salon message_id:123 emoji:🎉 role:@role [description:...]
 *   /reactionrole remove  id:uuid
 *   /reactionrole list  [channel:@salon] [message_id:123]
 *   /reactionrole sync  channel:@salon message_id:123  (re-poste l'embed)
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { ReactionRolesService } = require('../services/reaction-roles.service.js');

function isAdmin(interaction) {
    return interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageRoles);
}

class ReactionRoleCommands {
    static inject = [ReactionRolesService];

    constructor(service) {
        this.service = service;
    }

    async executeAdd(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageRoles)', ephemeral: true });
        }
        const channel = interaction.options.getChannel('channel');
        const messageId = interaction.options.getString('message_id');
        const emojiInput = interaction.options.getString('emoji');
        const role = interaction.options.getRole('role');
        const description = interaction.options.getString('description');

        const emoji = parseEmoji(emojiInput);
        if (!emoji) {
            return interaction.reply({ content: '❌ Emoji invalide. Utilise un unicode (🎉) ou un custom au format `nom:id`.', ephemeral: true });
        }

        const r = await this.service.create({
            guildId: interaction.guild.id,
            channelId: channel.id,
            messageId,
            emoji: emoji.key,
            roleId: role.id,
            description,
            mode: 'toggle'
        });
        if (!r.ok) {
            const messages = {
                already_exists: '❌ Ce reaction-role existe déjà pour ce couple message+emoji',
                cannot_use_everyone: '❌ Impossible d\'utiliser @everyone comme rôle cible',
                missing_params: '❌ Paramètres manquants',
                invalid_emoji: '❌ Emoji invalide'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }

        // Ajoute la reaction sur le message (si possible)
        try {
            const message = await channel.messages.fetch(messageId);
            await message.react(emojiInput);
        } catch (err) {
            // Pas grave si ça échoue (le user peut le faire à la main)
        }

        return interaction.reply({ content: `✅ Reaction-role créé : ${emojiInput} → ${role}`, ephemeral: true });
    }

    async executeRemove(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs (ManageRoles)', ephemeral: true });
        }
        const id = interaction.options.getString('id');
        const r = await this.service.get(id);
        if (!r) {
            return interaction.reply({ content: '❌ Reaction-role introuvable', ephemeral: true });
        }
        await this.service.delete(id);
        return interaction.reply({ content: '✅ Reaction-role supprimé', ephemeral: true });
    }

    async executeList(interaction) {
        const channel = interaction.options.getChannel('channel');
        const messageId = interaction.options.getString('message_id');

        let list;
        if (messageId && channel) {
            list = await this.service.listByMessage(interaction.guild.id, messageId);
        } else {
            list = await this.service.list(interaction.guild.id, 50, 0);
        }
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun reaction-role configuré', ephemeral: true });
        }
        const lines = list.slice(0, 20).map(r => `• ${r.emoji} → <@&${r.roleId}> sur [ce message](https://discord.com/channels/${interaction.guild.id}/${r.channelId}/${r.messageId})${r.description ? ` — *${r.description}*` : ''}`);
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎭 Reaction-roles')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

/**
 * Parse un input emoji. Accepte :
 *   - "🎉"               (unicode direct)
 *   - "name:id"          (custom emoji)
 *   - ":name:id:"        (avec deux-points autour)
 */
function parseEmoji(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (s.includes(':')) {
        const cleaned = s.replace(/^:|:$/g, '');
        const parts = cleaned.split(':');
        if (parts.length === 2 && parts[0] && parts[1]) {
            return { key: `${parts[0]}:${parts[1]}`, display: s };
        }
    }
    // Unicode emoji brut
    return { key: s, display: s };
}

const addBuilder = new SlashCommandBuilder()
    .setName('reactionrole-add')
    .setDescription('Ajouter un reaction-role (admin)')
    .addChannelOption(o => o.setName('channel').setDescription('Salon du message').setRequired(true))
    .addStringOption(o => o.setName('message_id').setDescription('ID du message').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji (unicode ou nom:id)').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Rôle à donner').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Description (optionnel)').setRequired(false).setMaxLength(200))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

const removeBuilder = new SlashCommandBuilder()
    .setName('reactionrole-remove')
    .setDescription('Supprimer un reaction-role (admin)')
    .addStringOption(o => o.setName('id').setDescription('ID du reaction-role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

const listBuilder = new SlashCommandBuilder()
    .setName('reactionrole-list')
    .setDescription('Lister les reaction-roles')
    .addChannelOption(o => o.setName('channel').setDescription('Filtrer par salon (optionnel)').setRequired(false))
    .addStringOption(o => o.setName('message_id').setDescription('Filtrer par message (optionnel)').setRequired(false));

Command({ name: 'reactionrole-add', builder: addBuilder })(ReactionRoleCommands.prototype, 'executeAdd');
Command({ name: 'reactionrole-remove', builder: removeBuilder })(ReactionRoleCommands.prototype, 'executeRemove');
Command({ name: 'reactionrole-list', builder: listBuilder })(ReactionRoleCommands.prototype, 'executeList');

module.exports = { ReactionRoleCommands };
