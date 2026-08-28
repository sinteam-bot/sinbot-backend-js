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

async function executeAddButton(interaction) {
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: '❌ Réservé aux admins (ManageRoles)', ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    const messageId = interaction.options.getString('message_id');
    const label = interaction.options.getString('label');
    const style = interaction.options.getString('style') || 'primary';
    const emoji = interaction.options.getString('emoji');
    const action = interaction.options.getString('action') || 'toggle_role';
    const role = interaction.options.getRole('role');
    const url = interaction.options.getString('url');

    const metadata = { label, style, emoji, action, url, customIdSuffix: messageId };
    if (role) metadata.roleId = role.id;
    if (action !== 'open_url' && !role) {
        return interaction.reply({ content: '❌ role requis pour action "' + action + '"', ephemeral: true });
    }
    if (action === 'open_url' && !url) {
        return interaction.reply({ content: '❌ url requis pour action open_url', ephemeral: true });
    }

    const r = await this.service.create({
        guildId: interaction.guild.id,
        channelId: channel.id,
        messageId,
        kind: 'button',
        roleId: role ? role.id : null,
        metadata
    });
    if (!r.ok) {
        return interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
    }
    return interaction.reply({ content: `✅ Bouton **${label}** ajouté.`, ephemeral: true });
}

const addButtonBuilder = new SlashCommandBuilder()
    .setName('reactionrole-add-button')
    .setDescription('Ajouter un bouton (toggle_role/give_role/take_role/open_url) à un message (admin)')
    .addChannelOption(o => o.setName('channel').setDescription('Salon du message').setRequired(true))
    .addStringOption(o => o.setName('message_id').setDescription('ID du message').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('Texte du bouton (max 80)').setRequired(true).setMaxLength(80))
    .addStringOption(o => o.setName('style').setDescription('Style du bouton').setRequired(false).addChoices(
        { name: 'primary', value: 'primary' },
        { name: 'secondary', value: 'secondary' },
        { name: 'success', value: 'success' },
        { name: 'danger', value: 'danger' },
        { name: 'link (pour open_url)', value: 'link' }
    ))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji du bouton (optionnel)').setRequired(false).setMaxLength(50))
    .addStringOption(o => o.setName('action').setDescription('Action').setRequired(false).addChoices(
        { name: 'toggle_role (default)', value: 'toggle_role' },
        { name: 'give_role (ajouter si absent)', value: 'give_role' },
        { name: 'take_role (retirer si présent)', value: 'take_role' },
        { name: 'open_url (lien externe)', value: 'open_url' }
    ))
    .addRoleOption(o => o.setName('role').setDescription('Rôle à attribuer/retirer (sauf open_url)').setRequired(false))
    .addStringOption(o => o.setName('url').setDescription('URL pour open_url (sinon inutile)').setRequired(false).setMaxLength(200))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

async function executeAddSelect(interaction) {
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: '❌ Réservé aux admins (ManageRoles)', ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    const messageId = interaction.options.getString('message_id');
    const placeholder = interaction.options.getString('placeholder');
    const minValues = interaction.options.getInteger('min_values') ?? 1;
    const maxValues = interaction.options.getInteger('max_values') ?? 1;
    const optionsStr = interaction.options.getString('options');

    // Parse les options : format "Label|value|roleId?;Label|value|roleId?;..."
    const options = optionsStr.split(';').map(s => {
        const parts = s.split('|').map(p => p.trim());
        if (parts.length < 2) return null;
        const opt = { label: parts[0], value: parts[1] };
        if (parts[2]) opt.roleId = parts[2];
        return opt;
    }).filter(Boolean);

    if (options.length === 0 || options.length > 25) {
        return interaction.reply({ content: '❌ options invalides (1 à 25 attendues, format: Label|value|roleId? séparées par ;)', ephemeral: true });
    }

    const roleId = options.find(o => o.roleId)?.roleId;
    const r = await this.service.create({
        guildId: interaction.guild.id,
        channelId: channel.id,
        messageId,
        kind: 'select',
        roleId,
        metadata: { placeholder, minValues, maxValues, options }
    });
    if (!r.ok) {
        return interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
    }
    return interaction.reply({ content: `✅ Select avec ${options.length} option(s) ajouté.`, ephemeral: true });
}

const addSelectBuilder = new SlashCommandBuilder()
    .setName('reactionrole-add-select')
    .setDescription('Ajouter un select menu (max 25 options) à un message (admin)')
    .addChannelOption(o => o.setName('channel').setDescription('Salon du message').setRequired(true))
    .addStringOption(o => o.setName('message_id').setDescription('ID du message').setRequired(true))
    .addStringOption(o => o.setName('options').setDescription('Options: "Label|value|roleId?" séparées par ;').setRequired(true).setMaxLength(1000))
    .addStringOption(o => o.setName('placeholder').setDescription('Texte affiché quand rien n\'est sélectionné').setRequired(false).setMaxLength(100))
    .addIntegerOption(o => o.setName('min_values').setDescription('Nb min d\'options (0 = optionnel, default 1)').setRequired(false).setMinValue(0).setMaxValue(25))
    .addIntegerOption(o => o.setName('max_values').setDescription('Nb max d\'options (1 = single, default 1)').setRequired(false).setMinValue(1).setMaxValue(25))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

Command({ name: 'reactionrole-add-button', builder: addButtonBuilder })(ReactionRoleCommands.prototype, 'executeAddButton');
Command({ name: 'reactionrole-add-select', builder: addSelectBuilder })(ReactionRoleCommands.prototype, 'executeAddSelect');

module.exports = { ReactionRoleCommands };
