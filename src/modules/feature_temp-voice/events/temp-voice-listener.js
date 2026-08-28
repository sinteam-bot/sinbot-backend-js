/**
 * temp-voice-listener.js
 *
 * - voiceStateUpdate(oldState, newState) :
 *   - si user rejoint un join_channel → crée un temp voice + déplace
 *   - si user quitte un temp voice → marque empty (cleanup cron supprimera)
 *   - si user rejoint un temp voice → markActive (last_empty_at = 0)
 *   - rename si plusieurs users dans un temp voice (suffixe 🎮)
 *
 * Le listener s'appuie sur `featureRegistry` pour activer/désactiver
 * la feature et lit la config depuis le service.
 */

const { ChannelType, OverwriteType, PermissionFlagsBits } = require('discord.js');
const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { TempVoiceService } = require('../services/temp-voice.service.js');

class TempVoiceListener {
    static inject = [TempVoiceService];

    constructor(service) {
        this.service = service;
        this._client = null;
    }

    setClient(client) { this._client = client; }

    async _isEnabled(guildId) {
        const state = await featureRegistry.get(guildId, 'temp-voice');
        return state.enabled ? state.config : null;
    }

    async _isTempVoice(channelId) {
        if (!channelId) return false;
        const s = await this.service.getState(channelId);
        return !!s;
    }

    async onVoiceStateUpdate(oldState, newState) {
        const member = newState.member || oldState.member;
        if (!member || member.user?.bot) return;
        const guild = newState.guild;
        if (!guild) return;
        const config = await this._isEnabled(guild.id);
        if (!config || !config.enabled) return;

        const newChannel = newState.channel;
        const oldChannel = oldState.channel;

        // === Cas 1 : user rejoint un join_channel ===
        if (newChannel && config.joinChannels?.includes(newChannel.id) && (!oldChannel || oldChannel.id !== newChannel.id)) {
            if (await this.service.canCreate(guild.id, config)) {
                await this._createTempChannel(guild, member, config);
            }
            return;
        }

        // === Cas 2 : user rejoint un temp voice existant ===
        if (newChannel && await this._isTempVoice(newChannel.id)) {
            await this.service.markActive(newChannel.id);
            await this._maybeRename(guild, newChannel);
            return;
        }

        // === Cas 3 : user quitte un temp voice ===
        if (oldChannel && await this._isTempVoice(oldChannel.id) && (!newChannel || newChannel.id !== oldChannel.id)) {
            try {
                const ch = await guild.channels.fetch(oldChannel.id).catch(() => null);
                if (ch && ch.members && ch.members.size === 0) {
                    await this.service.markEmpty(oldChannel.id);
                }
            } catch (err) {
                console.warn('[TempVoiceListener] Erreur vérification salon vocal vide:', err.message);
            }
            return;
        }
    }

    /**
     * Suppression safety net (channelDelete)
     */
    async onChannelDelete(channel) {
        if (!channel?.guild) return;
        const config = await this._isEnabled(channel.guild.id);
        if (!config) return;
        await this.service.forgetChannel(channel.id);
    }

    async _createTempChannel(guild, member, config) {
        try {
            const name = this.service.computeChannelName(member.user, config);
            const { ChannelType, PermissionFlagsBits } = require('discord.js');
            const overwrites = [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
                },
                {
                    id: member.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                        PermissionFlagsBits.MuteMembers,
                        PermissionFlagsBits.MoveMembers,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ];
            if (config.lockedRoleId) {
                overwrites.push({ id: config.lockedRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] });
            }
            let cat = null;
            if (config.categoryId) {
                cat = await guild.channels.fetch(config.categoryId).catch(() => null);
                if (!cat || cat.type !== ChannelType.GuildCategory) {
                    // fallback : à la racine du guild
                    cat = null;
                }
            }
            const created = await guild.channels.create({
                name: name.slice(0, 100),
                type: ChannelType.GuildVoice,
                parent: config.categoryId && cat ? config.categoryId : null,
                permissionOverwrites: overwrites
            });
            await this.service.registerChannel(created.id, guild.id, member.id);
            try {
                await member.voice.setChannel(created);
            } catch (err) {
                console.warn(`[TempVoiceListener] move failed: ${err.message}`);
            }
        } catch (err) {
            console.warn(`[TempVoiceListener] createTempChannel failed: ${err.message}`);
        }
    }

    async _maybeRename(guild, channel) {
        try {
            const state = await this.service.getState(channel.id);
            if (!state) return;
            const count = channel.members?.size ?? 0;
            // Récupère le creator pour le nom
            let displayName = state.creatorId;
            try {
                const creator = await guild.members.fetch(state.creatorId);
                displayName = creator?.user?.globalName || creator?.user?.username || state.creatorId;
            } catch (err) {
                console.debug('[TempVoiceListener] Impossible de fetch créateur vocal:', err.message);
            }
            const newName = this.service.computeSuffixName(
                this.service.computeChannelName(
                    { globalName: displayName, username: displayName },
                    { format: "{user}'s channel" }
                ),
                count
            );
            if (newName && newName !== channel.name) {
                await channel.setName(newName).catch(err => {
                    console.warn('[TempVoiceListener] Impossible de renommer le salon vocal:', err.message);
                });
            }
        } catch (err) {
            console.warn('[TempVoiceListener] Erreur _maybeRename:', err.message);
        }
    }
}

OnEvent('voiceStateUpdate', { configKey: 'features.temp-voice', priority: 25 })(TempVoiceListener.prototype, 'onVoiceStateUpdate');
OnEvent('channelDelete', { configKey: 'features.temp-voice', priority: 25 })(TempVoiceListener.prototype, 'onChannelDelete');

module.exports = { TempVoiceListener };
