const assert = require('node:assert');
const { test, describe, beforeAll, afterAll, beforeEach } = require("vitest");
const DiscordCacheService = require('../src/services/discordCacheService.js');
const { pool } = require('../src/database.js');
const { ensureTestDbReady } = require('./helpers/pglite');

describe('Discord Cache Service Tests', () => {

    beforeAll(async () => {
        await ensureTestDbReady();
    });

    test('cacheGuildEmojis: should store emojis in discord_emojis', async () => {
        const mockGuild = {
            id: 'guild_123',
            name: 'Test Guild',
            emojis: {
                cache: new Map([
                    ['emoji_1', {
                        id: 'emoji_1',
                        name: 'super_cat',
                        animated: false,
                        imageURL: () => 'https://cdn.discordapp.com/emojis/emoji_1.png',
                        roles: { cache: new Map() },
                        createdAt: new Date()
                    }],
                    ['emoji_2', {
                        id: 'emoji_2',
                        name: 'animated_fire',
                        animated: true,
                        imageURL: () => 'https://cdn.discordapp.com/emojis/emoji_2.gif',
                        roles: { cache: new Map([['role_admin', { id: 'role_admin' }]]) },
                        createdAt: new Date()
                    }]
                ])
            }
        };

        const count = await DiscordCacheService.cacheGuildEmojis(mockGuild);
        assert.strictEqual(count, 2);

        const res = await pool.query('SELECT * FROM discord_emojis WHERE emoji_id = $1', ['emoji_1']);
        assert.strictEqual(res.rows.length, 1);
        assert.strictEqual(res.rows[0].name, 'super_cat');
        assert.strictEqual(res.rows[0].animated, 0);
    });

    test('cacheGuildRoles: should store roles with colors and hierarchy in discord_roles', async () => {
        const mockGuild = {
            id: 'guild_123',
            name: 'Test Guild',
            roles: {
                cache: new Map([
                    ['role_admin', {
                        id: 'role_admin',
                        name: 'Administrateur',
                        color: 15158332,
                        iconURL: () => 'https://cdn.discordapp.com/role-icons/admin.png',
                        unicodeEmoji: null,
                        members: new Set(['user_1', 'user_2']),
                        hoist: true,
                        position: 10,
                        permissions: { bitfield: 8n },
                        managed: false,
                        mentionable: true,
                        createdAt: new Date()
                    }],
                    ['guild_123', {
                        id: 'guild_123',
                        name: '@everyone',
                        color: 0,
                        position: 0
                    }]
                ])
            }
        };

        const count = await DiscordCacheService.cacheGuildRoles(mockGuild);
        assert.strictEqual(count, 1); // @everyone is excluded

        const res = await pool.query('SELECT * FROM discord_roles WHERE role_id = $1', ['role_admin']);
        assert.strictEqual(res.rows.length, 1);
        assert.strictEqual(res.rows[0].name, 'Administrateur');
        assert.strictEqual(res.rows[0].color, 15158332);
        assert.strictEqual(res.rows[0].color_hex, '#e74c3c');
        assert.strictEqual(res.rows[0].member_count, 2);
    });

    test('cacheGuildChannels: should store channels and threads in discord_channels/discord_threads', async () => {
        const mockGuild = {
            id: 'guild_123',
            name: 'Test Guild',
            channels: {
                cache: new Map([
                    ['chan_general', {
                        id: 'chan_general',
                        name: 'général',
                        type: 0,
                        parentId: 'cat_text',
                        position: 1,
                        topic: 'Salon principal',
                        nsfw: false,
                        isThread: () => false,
                        createdAt: new Date()
                    }],
                    ['thread_help', {
                        id: 'thread_help',
                        name: 'Besoin d\'aide',
                        parentId: 'chan_general',
                        ownerId: 'user_1',
                        archived: false,
                        locked: false,
                        messageCount: 5,
                        memberCount: 3,
                        isThread: () => true,
                        createdAt: new Date()
                    }]
                ])
            }
        };

        const count = await DiscordCacheService.cacheGuildChannels(mockGuild);
        assert.strictEqual(count, 2);

        const chanRes = await pool.query('SELECT * FROM discord_channels WHERE channel_id = $1', ['chan_general']);
        assert.strictEqual(chanRes.rows.length, 1);
        assert.strictEqual(chanRes.rows[0].name, 'général');

        const threadRes = await pool.query('SELECT * FROM discord_threads WHERE thread_id = $1', ['thread_help']);
        assert.strictEqual(threadRes.rows.length, 1);
        assert.strictEqual(threadRes.rows[0].name, 'Besoin d\'aide');
    });

    test('cacheGuildMembers: should store users and server_members with avatars, pseudos and roles', async () => {
        const mockGuild = {
            id: 'guild_123',
            name: 'Test Guild',
            members: {
                fetch: async () => {},
                cache: new Map([
                    ['user_100', {
                        id: 'user_100',
                        displayName: 'Alex (Modo)',
                        displayColor: 3447003,
                        joinedAt: new Date('2024-01-15T10:00:00Z'),
                        presence: { status: 'online' },
                        guild: { id: 'guild_123' },
                        user: {
                            id: 'user_100',
                            username: 'alex',
                            globalName: 'Alex Global',
                            discriminator: '1234',
                            bot: false,
                            avatar: 'avatar_hash_123',
                            createdAt: new Date('2023-05-01T00:00:00Z'),
                            bannerURL: () => 'https://banner.png'
                        },
                        roles: {
                            highest: { id: 'role_mod', name: 'Modérateur' },
                            cache: new Map([
                                ['role_mod', {
                                    id: 'role_mod',
                                    name: 'Modérateur',
                                    color: 3447003,
                                    position: 5,
                                    iconURL: () => null,
                                    unicodeEmoji: '🛡️',
                                    hoist: true
                                }]
                            ])
                        }
                    }]
                ])
            }
        };

        const count = await DiscordCacheService.cacheGuildMembers(mockGuild);
        assert.strictEqual(count, 1);

        const memberRes = await pool.query('SELECT * FROM server_members WHERE user_id = $1', ['user_100']);
        assert.strictEqual(memberRes.rows.length, 1);
        assert.strictEqual(memberRes.rows[0].display_name, 'Alex (Modo)');
        assert.strictEqual(memberRes.rows[0].highest_role_name, 'Modérateur');
        assert.strictEqual(memberRes.rows[0].display_color, '#3498db');
        assert.strictEqual(memberRes.rows[0].presence, 'online');

        const userRes = await pool.query('SELECT * FROM discord_users WHERE user_id = $1', ['user_100']);
        assert.strictEqual(userRes.rows.length, 1);
        assert.strictEqual(userRes.rows[0].username, 'alex');
    });

    test('cacheDiscordMessage: should store messages in discord_messages', async () => {
        const mockMessage = {
            id: 'msg_999',
            channel: { id: 'chan_general', isThread: () => false },
            guild: { id: 'guild_123' },
            author: { id: 'user_100', username: 'alex', bot: false },
            member: null,
            content: 'Hello World cached message !',
            pinned: false,
            embeds: [{ title: 'Embed Test', description: 'Test description' }],
            attachments: new Map([
                ['att_1', { id: 'att_1', name: 'image.png', url: 'https://cdn.discordapp.com/att.png', size: 1024, contentType: 'image/png' }]
            ]),
            reactions: { cache: new Map() },
            createdAt: new Date()
        };

        await DiscordCacheService.cacheDiscordMessage(mockMessage);

        const msgRes = await pool.query('SELECT * FROM discord_messages WHERE message_id = $1', ['msg_999']);
        assert.strictEqual(msgRes.rows.length, 1);
        assert.strictEqual(msgRes.rows[0].content, 'Hello World cached message !');
        assert.ok(msgRes.rows[0].embeds_json.includes('Embed Test'));
    });

    test('Soft-Delete: should properly soft-delete emojis, roles, channels, messages, and members', async () => {
        // 1. Soft-delete emoji
        await DiscordCacheService.softDeleteEmoji('emoji_1');
        let res = await pool.query('SELECT * FROM discord_emojis WHERE emoji_id = $1', ['emoji_1']);
        assert.ok(res.rows[0].deleted_at !== null);

        // 2. Soft-delete role
        await DiscordCacheService.softDeleteRole('role_admin');
        res = await pool.query('SELECT * FROM discord_roles WHERE role_id = $1', ['role_admin']);
        assert.ok(res.rows[0].deleted_at !== null);

        // 3. Soft-delete channel
        await DiscordCacheService.softDeleteChannel('chan_general');
        res = await pool.query('SELECT * FROM discord_channels WHERE channel_id = $1', ['chan_general']);
        assert.ok(res.rows[0].deleted_at !== null);

        // 4. Soft-delete message
        await DiscordCacheService.softDeleteMessage('msg_999');
        res = await pool.query('SELECT * FROM discord_messages WHERE message_id = $1', ['msg_999']);
        assert.ok(res.rows[0].deleted_at !== null);

        // 5. Soft-delete member
        await DiscordCacheService.softDeleteMember('user_100');
        res = await pool.query('SELECT * FROM server_members WHERE user_id = $1', ['user_100']);
        assert.ok(res.rows[0].deleted_at !== null);
        assert.ok(res.rows[0].left_at !== null);
        assert.strictEqual(res.rows[0].presence, 'offline');
    });

    test('markMemberLeft & logMemberEvent: safely handle missing username and guildId without constraint errors', async () => {
        const dbHelper = require('../src/database.js');
        // Insérer un membre de test
        await dbHelper.registerNewMember({
            user_id: 'user_leave_test',
            username: 'LeaverUser',
            discriminator: '0001',
            guild_id: 'guild_123'
        });

        // Appeler markMemberLeft sans username ni guildId
        const res = await dbHelper.markMemberLeft('user_leave_test');
        assert.ok(res);
        assert.strictEqual(res.userId, 'user_leave_test');

        const historyRes = await pool.query('SELECT * FROM member_history WHERE user_id = $1', ['user_leave_test']);
        assert.ok(historyRes.rows.length >= 1);
        const leaveEvent = historyRes.rows.find(r => r.action === 'leave');
        assert.ok(leaveEvent);
        assert.strictEqual(leaveEvent.username, 'LeaverUser');
    });

    test('syncAllDiscordCache: executes full sync without error', async () => {
        const mockGuild = {
            id: 'guild_123',
            name: 'Test Guild',
            emojis: { cache: new Map() },
            roles: { cache: new Map() },
            channels: { cache: new Map() },
            members: {
                fetch: async () => {},
                cache: new Map()
            }
        };

        await DiscordCacheService.syncAllDiscordCache(mockGuild);
    });

});
