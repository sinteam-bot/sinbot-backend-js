/**
 * tests/logs-split-routing.test.js
 *
 * Tests unitaires pour le routage multi-salons des logs (Phase 12 G20).
 */

import { describe, it, expect } from 'vitest';
import { LogsService } from '../src/modules/security_logs/services/logs.service.js';

describe('Feature G20: Split Logs Multi-Channel Routing Tests', () => {
    it('should route events to dedicated channels and fallback gracefully', () => {
        const service = new LogsService();

        service.setConfig({
            channel_id: 'chan_fallback_default',
            channels: {
                moderation: 'chan_mod_1',
                messages: 'chan_msg_2',
                members: 'chan_member_3',
                voice: 'chan_voice_4',
                server: 'chan_server_5'
            }
        });

        expect(service._channelForType('member_join')).toBe('chan_member_3');
        expect(service._channelForType('member_leave')).toBe('chan_member_3');
        expect(service._channelForType('message_delete')).toBe('chan_msg_2');
        expect(service._channelForType('message_edit')).toBe('chan_msg_2');
        expect(service._channelForType('voice_state_update')).toBe('chan_voice_4');
        expect(service._channelForType('ban_add')).toBe('chan_mod_1');
        expect(service._channelForType('sanction_warn')).toBe('chan_mod_1');
        expect(service._channelForType('guild_update')).toBe('chan_server_5');
        expect(service._channelForType('unknown_event')).toBe('chan_server_5');
    });

    it('should use global channel_id when specific channels are not configured', () => {
        const service = new LogsService();

        service.setConfig({
            channel_id: 'chan_all_logs',
            channels: {}
        });

        expect(service._channelForType('member_join')).toBe('chan_all_logs');
        expect(service._channelForType('message_delete')).toBe('chan_all_logs');
        expect(service._channelForType('ban_add')).toBe('chan_all_logs');
    });
});
