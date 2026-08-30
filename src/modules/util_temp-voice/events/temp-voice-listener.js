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
        if (!state || state.enabled === false) return null;
        return state.config || {};
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
        if (!config || config.enabled === false) return;

        const newChannel = newState.channel;
        const oldChannel = oldState.channel;

        const rawJoin = config.join_channels || config.joinChannels || [];
        const joinChannels = Array.isArray(rawJoin)
            ? rawJoin
            : (typeof rawJoin === 'string' && rawJoin.trim() !== '' ? [rawJoin.trim()] : []);

        const categoryId = config.category_id || config.categoryId || null;
        const deleteDelaySeconds = Number(config.delete_delay_seconds ?? config.deleteDelaySeconds) || 5;
        const maxPerGuild = Number(config.max_per_guild ?? config.maxPerGuild) || 0;

        // === Cas 1 : user rejoint un join_channel ===
        const isJoin = newChannel && joinChannels.includes(newChannel.id);
        if (newChannel && isJoin && (!oldChannel || oldChannel.id !== newChannel.id)) {
            console.log(`🔊 [TempVoice] Membre ${member.user.tag} (${member.id}) a rejoint le salon déclencheur "${newChannel.name}" (${newChannel.id})`);
            if (await this.service.canCreate(guild.id, { ...config, maxPerGuild, max_per_guild: maxPerGuild })) {
                await this._createTempChannel(guild, member, {
                    ...config,
                    categoryId,
                    category_id: categoryId,
                    deleteDelaySeconds,
                    delete_delay_seconds: deleteDelaySeconds,
                    joinChannels,
                    join_channels: joinChannels
                });
            } else {
                console.warn(`⚠️ [TempVoice] Limite max de salons temporaires atteinte sur ${guild.name}`);
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
                    console.log(`⏳ [TempVoice] Salon "${ch.name}" (${oldChannel.id}) est vide. Suppression dans ${deleteDelaySeconds}s...`);

                    const targetChannelId = oldChannel.id;
                    setTimeout(async () => {
                        try {
                            const currentCh = await guild.channels.fetch(targetChannelId).catch(() => null);
                            if (!currentCh) {
                                await this.service.forgetChannel(targetChannelId);
                                return;
                            }
                            if (currentCh.members && currentCh.members.size === 0) {
                                console.log(`🗑️ [TempVoice] Suppression du salon éphémère vide "${currentCh.name}" (${targetChannelId})`);
                                await currentCh.delete('Salon temporaire vide (délai expiré)').catch(err => {
                                    console.warn(`[TempVoice] Erreur suppression salon: ${err.message}`);
                                });
                                await this.service.forgetChannel(targetChannelId);
                            }
                        } catch (err) {
                            console.warn(`[TempVoice] Erreur timer suppression: ${err.message}`);
                        }
                    }, Math.max(deleteDelaySeconds, 0) * 1000);
                } else if (ch) {
                    await this._maybeRename(guild, ch);
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
            console.log(`🔊 [TempVoice] Création du salon temporaire "${name}" pour ${member.user.tag}...`);
            const { ChannelType, PermissionFlagsBits } = require('discord.js');
            const overwrites = [
                {
                    id: guild.roles.everyone.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.Connect]
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
            if (guild.members?.me) {
                overwrites.push({
                    id: guild.members.me.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                        PermissionFlagsBits.MoveMembers,
                        PermissionFlagsBits.ManageChannels
                    ]
                });
            }
            if (config.lockedRoleId) {
                overwrites.push({ id: config.lockedRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] });
            }
            const targetCatId = config.category_id || config.categoryId || null;
            let cat = null;
            if (targetCatId) {
                cat = await guild.channels.fetch(targetCatId).catch(() => null);
                if (!cat || cat.type !== ChannelType.GuildCategory) {
                    // fallback : à la racine du guild
                    cat = null;
                }
            }
            const created = await guild.channels.create({
                name: name.slice(0, 100),
                type: ChannelType.GuildVoice,
                parent: targetCatId && cat ? targetCatId : null,
                permissionOverwrites: overwrites
            });
            await this.service.registerChannel(created.id, guild.id, member.id);
            console.log(`✅ [TempVoice] Salon temporaire "${created.name}" (${created.id}) créé avec succès.`);
            try {
                await member.voice.setChannel(created);
                console.log(`✅ [TempVoice] ${member.user.tag} déplacé dans "${created.name}".`);
            } catch (err) {
                console.warn(`⚠️ [TempVoiceListener] Échec déplacement vocal: ${err.message}`);
            }
        } catch (err) {
            console.error(`❌ [TempVoiceListener] createTempChannel failed: ${err.message}`, err);
        }
    }

    async _maybeRename(guild, channel) {
        try {
            const state = await this.service.getState(channel.id);
            if (!state) return;
            const config = await this._isEnabled(guild.id);
            const count = channel.members?.size ?? 0;
            // Récupère le creator pour le nom
            let userObj = { globalName: state.creatorId, username: state.creatorId };
            try {
                const creator = await guild.members.fetch(state.creatorId);
                if (creator?.user) {
                    userObj = {
                        globalName: creator.user.globalName || creator.displayName || creator.user.username,
                        username: creator.user.username
                    };
                }
            } catch (err) {
                console.debug('[TempVoiceListener] Impossible de fetch créateur vocal:', err.message);
            }
            const baseName = this.service.computeChannelName(
                userObj,
                config || {}
            );
            const newName = this.service.computeSuffixName(baseName, count);
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
