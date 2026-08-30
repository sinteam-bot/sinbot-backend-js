/**
 * temp-voice-cleanup.js — @Cron toutes les 60 secondes
 * Supprime les vocaux temporaires vides depuis >= delete_delay_seconds
 */

const { Cron } = require('../../../core/index.js');
const { TempVoiceService } = require('../services/temp-voice.service.js');

class TempVoiceCleanup {
    static inject = [TempVoiceService];

    constructor (service) {
        this.service = service;
        this._client = null;
    }

    setClient(client) { this._client = client; }

    async tick() {
        try {
            const guilds = new Set();
            for (const guild of (this._client?.guilds?.cache?.values() || [])) {
                guilds.add(guild);
            }
            // Si on n'a pas accès au client (tests, par exemple), on
            // récupère les guilds depuis temp_voice_state
            if (guilds.size === 0) return;

            for (const guild of guilds) {
                await this._processGuild(guild);
            }
        } catch (err) {
            console.error(`[TempVoiceCleanup] tick failed: ${err.message}`);
        }
    }

    async _processGuild(guild) {
        const config = await this.service.getConfig(guild.id);
        if (!config || config.enabled === false) return;
        const delay = Number(config.deleteDelaySeconds ?? config.delete_delay_seconds ?? 5);
        const expiring = await this.service.listExpiringNow(guild.id, delay);
        for (const state of expiring) {
            try {
                const channel = await guild.channels.fetch(state.channelId).catch(() => null);
                if (!channel) {
                    // déjà supprimé par Discord
                    await this.service.forgetChannel(state.channelId);
                    continue;
                }
                if (channel.members && channel.members.size === 0) {
                    console.log(`🗑️ [TempVoiceCleanup] Suppression du salon temporaire vide "${channel.name}" (${state.channelId})`);
                    await channel.delete('Temp voice cleanup (empty)').catch(err => {
                        console.warn(`[TempVoiceCleanup] delete ${state.channelId} failed: ${err.message}`);
                    });
                }
                await this.service.forgetChannel(state.channelId);
            } catch (err) {
                console.warn(`[TempVoiceCleanup] delete ${state.channelId} failed: ${err.message}`);
            }
        }
    }
}

Cron('* * * * * *', { timezone: 'Europe/Paris' })(TempVoiceCleanup.prototype, 'tick');

module.exports = { TempVoiceCleanup };
