/**
 * Listeners pour la feature Logs & Stats (Phase 4)
 *
 * 17 méthodes correspondant à 17 events Discord.js, toutes
 * décorées @OnEvent et déléguant à LogsService.log() avec un
 * mapping vers event_type et les champs actor/target/channel.
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { LogsService } = require('../services/logs.service.js');

class LogsListeners {
    static inject = [LogsService];

    constructor(logs) {
        this.logs = logs;
    }

    async _ensureConfig(guild) {
        const state = await featureRegistry.get(guild.id, 'logs');
        if (state.enabled) this.logs.setConfig(state.config);
        return state;
    }

    // =================== MESSAGES ===================

    async onMessageDelete(message) {
        if (!message?.guild) return;
        if (message.author?.bot) return;
        const state = await this._ensureConfig(message.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.message_delete) return;

        await this.logs.log(message.guild, 'message_delete', {
            actorId: undefined,
            targetId: message.author?.id,
            channelId: message.channelId,
            content: message.content || '',
            summary: `Message de ${message.author?.tag || message.author?.id || 'inconnu'} supprimé`
        });
    }

    async onMessageUpdate(oldMessage, newMessage) {
        if (!newMessage?.guild) return;
        if (newMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return;
        const state = await this._ensureConfig(newMessage.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.message_edit) return;

        await this.logs.log(newMessage.guild, 'message_edit', {
            targetId: newMessage.author?.id,
            channelId: newMessage.channelId,
            content: `${oldMessage.content || ''} → ${newMessage.content || ''}`,
            summary: `Message de ${newMessage.author?.tag || newMessage.author?.id} modifié`
        });
    }

    async onMessageBulkDelete(messages) {
        if (!messages?.size && !messages?.length) return;
        const coll = messages.size ? messages : new Map(messages.map((m, i) => [i, m]));
        const first = coll.values().next().value;
        if (!first?.guild) return;
        const state = await this._ensureConfig(first.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.message_bulk_delete) return;

        await this.logs.log(first.guild, 'message_bulk_delete', {
            channelId: first.channelId,
            metadata: { count: coll.size },
            summary: `${coll.size} message(s) supprimé(s) en masse`
        });
    }

    // =================== MEMBERS ===================

    async onGuildMemberAdd(member) {
        const state = await this._ensureConfig(member.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.member_join) return;

        await this.logs.log(member.guild, 'member_join', {
            targetId: member.id,
            summary: `${member.user?.tag || member.id} a rejoint`
        });
    }

    async onGuildMemberRemove(member) {
        const state = await this._ensureConfig(member.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.member_leave) return;

        await this.logs.log(member.guild, 'member_leave', {
            targetId: member.id,
            summary: `${member.user?.tag || member.id} est parti`
        });
    }

    async onGuildMemberUpdate(oldMember, newMember) {
        if (!newMember?.guild) return;
        const changes = [];
        if (oldMember.nickname !== newMember.nickname) {
            changes.push(`nickname: \`${oldMember.nickname || 'aucun'}\` → \`${newMember.nickname || 'aucun'}\``);
        }
        if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
            const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
            const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
            for (const r of added.values()) changes.push(`+@${r.name}`);
            for (const r of removed.values()) changes.push(`-@${r.name}`);
        }
        if (changes.length === 0) return;
        const state = await this._ensureConfig(newMember.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.member_update) return;

        await this.logs.log(newMember.guild, 'member_update', {
            targetId: newMember.id,
            metadata: { changes },
            summary: `Membre ${newMember.user?.tag || newMember.id} modifié : ${changes.join(', ')}`
        });
    }

    async onGuildBanAdd(ban) {
        const state = await this._ensureConfig(ban.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.member_ban_add) return;

        await this.logs.log(ban.guild, 'member_ban_add', {
            targetId: ban.user.id,
            metadata: { reason: ban.reason },
            summary: `${ban.user.tag} banni (raison: ${ban.reason || 'aucune'})`
        });
    }

    async onGuildBanRemove(ban) {
        const state = await this._ensureConfig(ban.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.member_ban_remove) return;

        await this.logs.log(ban.guild, 'member_ban_remove', {
            targetId: ban.user.id,
            summary: `${ban.user.tag} débanni`
        });
    }

    // =================== ROLES ===================

    async onRoleCreate(role) {
        const state = await this._ensureConfig(role.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.role_create) return;
        await this.logs.log(role.guild, 'role_create', { targetId: role.id, summary: `Rôle créé : @${role.name}` });
    }

    async onRoleUpdate(oldRole, newRole) {
        if (!newRole?.guild) return;
        const changes = [];
        if (oldRole.name !== newRole.name) changes.push(`name: \`${oldRole.name}\` → \`${newRole.name}\``);
        if (oldRole.color !== newRole.color) changes.push(`color: #${oldRole.color.toString(16).padStart(6, '0')} → #${newRole.color.toString(16).padStart(6, '0')}`);
        if (oldRole.hoist !== newRole.hoist) changes.push(`hoist: ${oldRole.hoist} → ${newRole.hoist}`);
        if (changes.length === 0) return;
        const state = await this._ensureConfig(newRole.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.role_update) return;
        await this.logs.log(newRole.guild, 'role_update', { targetId: newRole.id, metadata: { changes }, summary: `Rôle @${newRole.name} modifié` });
    }

    async onRoleDelete(role) {
        const state = await this._ensureConfig(role.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.role_delete) return;
        await this.logs.log(role.guild, 'role_delete', { targetId: role.id, summary: `Rôle supprimé : @${role.name}` });
    }

    // =================== CHANNELS ===================

    async onChannelCreate(channel) {
        if (!channel?.guild) return;
        const state = await this._ensureConfig(channel.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.channel_create) return;
        await this.logs.log(channel.guild, 'channel_create', { channelId: channel.id, summary: `Salon créé : #${channel.name}` });
    }

    async onChannelUpdate(oldChannel, newChannel) {
        if (!newChannel?.guild) return;
        if (oldChannel.name === newChannel.name && oldChannel.topic === newChannel.topic) return;
        const state = await this._ensureConfig(newChannel.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.channel_update) return;
        await this.logs.log(newChannel.guild, 'channel_update', {
            channelId: newChannel.id,
            summary: `#${oldChannel.name} → #${newChannel.name}`
        });
    }

    async onChannelDelete(channel) {
        if (!channel?.guild) return;
        const state = await this._ensureConfig(channel.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.channel_delete) return;
        await this.logs.log(channel.guild, 'channel_delete', { channelId: channel.id, summary: `Salon supprimé : #${channel.name}` });
    }

    // =================== VOICE ===================

    async onVoiceStateUpdate(oldState, newState) {
        if (!newState?.guild) return;
        if (oldState.channelId === newState.channelId) return;
        const member = newState.member || oldState.member;
        if (member?.user?.bot) return;
        const state = await this._ensureConfig(newState.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.voice_state_update) return;

        let summary;
        if (!oldState.channelId && newState.channelId) {
            summary = `${member?.user?.tag || newState.id} a rejoint 🔊 ${newState.channel?.name || 'un vocal'}`;
        } else if (oldState.channelId && !newState.channelId) {
            summary = `${member?.user?.tag || newState.id} a quitté 🔊 ${oldState.channel?.name || 'un vocal'}`;
        } else {
            summary = `${member?.user?.tag || newState.id} a changé de salon vocal`;
        }

        await this.logs.log(newState.guild, 'voice_state_update', {
            targetId: member?.id,
            channelId: newState.channelId || oldState.channelId,
            summary
        });
    }

    // =================== SERVER ===================

    async onGuildUpdate(oldGuild, newGuild) {
        if (!newGuild) return;
        const changes = [];
        if (oldGuild.name !== newGuild.name) changes.push(`name: ${oldGuild.name} → ${newGuild.name}`);
        if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push(`verificationLevel: ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`);
        if (oldGuild.premiumTier !== newGuild.premiumTier) changes.push(`boost: T${oldGuild.premiumTier} → T${newGuild.premiumTier}`);
        if (changes.length === 0) return;
        const state = await this._ensureConfig(newGuild);
        if (!state.enabled) return;
        if (!state.config?.events?.guild_update) return;
        await this.logs.log(newGuild, 'guild_update', { metadata: { changes }, summary: changes.join(', ') });
    }

    async onEmojiCreate(emoji) {
        if (!emoji?.guild) return;
        const state = await this._ensureConfig(emoji.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.emoji_create) return;
        await this.logs.log(emoji.guild, 'emoji_create', { summary: `Emoji ajouté : :${emoji.name}:` });
    }

    async onEmojiDelete(emoji) {
        if (!emoji?.guild) return;
        const state = await this._ensureConfig(emoji.guild);
        if (!state.enabled) return;
        if (!state.config?.events?.emoji_delete) return;
        await this.logs.log(emoji.guild, 'emoji_delete', { summary: `Emoji supprimé : :${emoji.name}:` });
    }
}

OnEvent('messageDelete', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onMessageDelete');
OnEvent('messageUpdate', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onMessageUpdate');
OnEvent('messageDeleteBulk', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onMessageBulkDelete');
OnEvent('guildMemberAdd', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onGuildMemberAdd');
OnEvent('guildMemberRemove', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onGuildMemberRemove');
OnEvent('guildMemberUpdate', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onGuildMemberUpdate');
OnEvent('guildBanAdd', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onGuildBanAdd');
OnEvent('guildBanRemove', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onGuildBanRemove');
OnEvent('roleCreate', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onRoleCreate');
OnEvent('roleUpdate', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onRoleUpdate');
OnEvent('roleDelete', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onRoleDelete');
OnEvent('channelCreate', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onChannelCreate');
OnEvent('channelUpdate', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onChannelUpdate');
OnEvent('channelDelete', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onChannelDelete');
OnEvent('voiceStateUpdate', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onVoiceStateUpdate');
OnEvent('guildUpdate', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onGuildUpdate');
OnEvent('emojiCreate', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onEmojiCreate');
OnEvent('emojiDelete', { configKey: 'features.logs', priority: 30 })(LogsListeners.prototype, 'onEmojiDelete');

module.exports = { LogsListeners };
