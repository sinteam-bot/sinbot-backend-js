/**
 * temp-voice-cleanup.js — @Cron toutes les 30 secondes
 * Supprime les vocaux temporaires vides depuis >= delete_delay_seconds
 */

const { Cron } = require('../../../core/index.js');
const { TempVoiceService } = require('../services/temp-voice.service.js');

class TempVoiceCleanup {
    static inject = [TempVoiceService];

    constructor(service) {
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
        if (!config || !config.enabled) return;
        const expiring = await this.service.listExpiringNow(guild.id, config.deleteDelaySeconds || 5);
        for (const state of expiring) {
            try {
                const channel = await guild.channels.fetch(state.channelId).catch(() => null);
                if (!channel) {
                    // déjà supprimé par Discord
                    await this.service.forgetChannel(state.channelId);
                    continue;
                }
                if (channel.members && channel.members.size === 0) {
                    await channel.delete('Temp voice cleanup (empty)');
                }
                await this.service.forgetChannel(state.channelId);
            } catch (err) {
                console.warn(`[TempVoiceCleanup] delete ${state.channelId} failed: ${err.message}`);
            }
        }
    }
}

Cron('*/30 * * * * *', { timezone: 'Europe/Paris' })(TempVoiceCleanup.prototype, 'tick');

module.exports = { TempVoiceCleanup };
