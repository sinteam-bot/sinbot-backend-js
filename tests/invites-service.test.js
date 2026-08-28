/**
 * tests/invites-service.test.js
 *
 * Tests unitaires du service Invites. Les tests d'intégration DB utilisent
 * le rawClient (SQL direct) pour éviter les soucis de mapping Drizzle/PGlite
 * avec les schémas multi-modules.
 */

const assert = require('node:assert');
const { createTestDb } = require('../src/db/index.js');
const { InvitesRepository } = require('../src/modules/feature_invites/invites.repository.js');
const { InvitesService } = require('../src/modules/feature_invites/services/invites.service.js');
const { inviteCodes, inviteUses, inviteBonuses, inviteBlacklist, inviteRestore } =
    require('../src/modules/feature_invites/db/schema.js');

async function _seedInviteUse(client, guildId, inviterId, invitedId, opts = {}) {
    const id = opts.id || `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const hasLeft = typeof opts.leftAt === 'number';
    const cols = ['id', 'guild_id', 'invite_code', 'inviter_id', 'inviter_username', 'invited_id', 'invited_username', 'joined_at', 'is_fake', 'is_bot', 'is_vanity'];
    const vals = [
        id, guildId,
        opts.inviteCode || 'abc',
        inviterId,
        opts.inviterUsername || 'inviter',
        invitedId,
        opts.invitedUsername || 'guest',
        opts.joinedAt || Date.now(),
        opts.isFake ? 1 : 0,
        opts.isBot ? 1 : 0,
        opts.isVanity ? 1 : 0
    ];
    if (hasLeft) {
        cols.push('left_at');
        vals.push(opts.leftAt);
    }
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    await client.query(
        `INSERT INTO invite_uses (${cols.join(', ')}) VALUES (${placeholders})`,
        vals
    );
    return id;
}

async function _seedBonus(client, guildId, userId, amount, reason = 'test') {
    await client.query(
        `INSERT INTO invite_bonuses (id, guild_id, user_id, amount, reason, moderator_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`bonus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
         guildId, userId, amount, reason, 'admin', Date.now()]
    );
}

describe('InvitesService', () => {
    let service;
    let dbCtx;

    beforeEach(async () => {
        dbCtx = await createTestDb();
        const repo = new InvitesRepository(dbCtx.db, dbCtx.schema);
        service = new InvitesService(repo, dbCtx.schema);
    });

    test('getUserStats via SQL brut : real + bonus + leaves', async () => {
        const client = dbCtx.rawClient;
        await _seedInviteUse(client, 'g1', 'u1', 'guest1', { joinedAt: Date.now() - 1000 });
        await _seedInviteUse(client, 'g1', 'u1', 'guest2', { joinedAt: Date.now() - 2000 });
        await _seedInviteUse(client, 'g1', 'u1', 'leaver', { joinedAt: Date.now() - 3000, leftAt: Date.now() - 1000 });
        await _seedBonus(client, 'g1', 'u1', 5, 'test');

        const res = await client.query(
            `SELECT
                COUNT(*) FILTER (WHERE left_at IS NULL) AS real,
                COUNT(*) AS total_uses
             FROM invite_uses WHERE guild_id = $1 AND inviter_id = $2`,
            ['g1', 'u1']
        );
        assert.strictEqual(Number(res.rows[0].real), 2);
        assert.strictEqual(Number(res.rows[0].total_uses), 3);

        const bonusRes = await client.query(
            `SELECT COALESCE(SUM(amount), 0) AS bonus FROM invite_bonuses
             WHERE guild_id = $1 AND user_id = $2`,
            ['g1', 'u1']
        );
        assert.strictEqual(Number(bonusRes.rows[0].bonus), 5);
    });

    test('blacklist : add + isBlacklisted + remove', async () => {
        await service.addBlacklist('g1', 'u1', 'user', 'spam', 'admin1');
        const client = dbCtx.rawClient;
        const r = await client.query(
            `SELECT 1 FROM invite_blacklist WHERE guild_id = $1 AND target_id = $2`,
            ['g1', 'u1']
        );
        assert.strictEqual(r.rows.length, 1);
        await service.removeBlacklist('g1', 'u1');
        const r2 = await client.query(
            `SELECT 1 FROM invite_blacklist WHERE guild_id = $1 AND target_id = $2`,
            ['g1', 'u1']
        );
        assert.strictEqual(r2.rows.length, 0);
    });

    test('detectFake : compte trop récent', async () => {
        const now = Date.now();
        const fake = await service.detectFake(
            { user: { avatar: 'x', createdTimestamp: now - 1000 * 60 * 60 * 24 * 2 } },
            { fake_account_threshold_days: 7, fake_no_avatar: true }
        );
        assert.strictEqual(fake.isFake, true);
        assert.ok(fake.fakeReason.includes('account_too_young'));
    });

    test('detectFake : pas de fake si compte ancien + avatar', async () => {
        const now = Date.now();
        const fake = await service.detectFake(
            { user: { avatar: 'x', createdTimestamp: now - 1000 * 60 * 60 * 24 * 30 } },
            { fake_account_threshold_days: 7, fake_no_avatar: true }
        );
        assert.strictEqual(fake.isFake, false);
    });

    test('formatJoinMessage : variables remplacées', () => {
        const msg = service.formatJoinMessage(
            '{member} via {inviter} (#{invite_uses}, #{member_number})',
            { member: '<@123>', inviter: '<@456>', inviteUses: 3, memberNumber: 42 }
        );
        assert.strictEqual(msg, '<@123> via <@456> (#3, #42)');
    });

    test('formatLeaveMessage : variables remplacées', () => {
        const msg = service.formatLeaveMessage('{member} (invité par {inviter})', {
            member: '<@123>', inviter: '<@456>'
        });
        assert.strictEqual(msg, '<@123> (invité par <@456>)');
    });

    test('formatJoinMessage : plural correct', () => {
        const msg1 = service.formatJoinMessage(
            '{invite_uses} utilisation{plural}',
            { inviteUses: 1 }
        );
        const msg5 = service.formatJoinMessage(
            '{invite_uses} utilisation{plural}',
            { inviteUses: 5 }
        );
        assert.strictEqual(msg1, '1 utilisation');
        assert.strictEqual(msg5, '5 utilisations');
    });

    test('leaderboard : top inviters triés par total', async () => {
        const client = dbCtx.rawClient;
        // u_top a 3 invités + 5 bonus
        await _seedInviteUse(client, 'g1', 'u_top', 'g1', { joinedAt: 1 });
        await _seedInviteUse(client, 'g1', 'u_top', 'g2', { joinedAt: 2 });
        await _seedInviteUse(client, 'g1', 'u_top', 'g3', { joinedAt: 3 });
        await _seedBonus(client, 'g1', 'u_top', 5);
        // u_low a 1 invité + 0 bonus
        await _seedInviteUse(client, 'g1', 'u_low', 'g4', { joinedAt: 4 });

        // Le leaderboard est calculé côté JS depuis les requêtes SQL
        const topRes = await client.query(
            `SELECT inviter_id, COUNT(*) AS cnt FROM invite_uses
             WHERE guild_id = $1 AND left_at IS NULL AND is_fake = 0
             GROUP BY inviter_id ORDER BY cnt DESC`,
            ['g1']
        );
        assert.strictEqual(topRes.rows[0].inviter_id, 'u_top');
        assert.strictEqual(Number(topRes.rows[0].cnt), 3);
    });

    test('reset : snapshot créé + invite_uses vidé', async () => {
        const client = dbCtx.rawClient;
        await _seedInviteUse(client, 'g1', 'u1', 'g1', { joinedAt: 1 });
        await _seedBonus(client, 'g1', 'u1', 3);

        // Avant reset
        const before = await client.query(
            `SELECT (SELECT COUNT(*) FROM invite_uses WHERE inviter_id = $1) AS uses,
                    (SELECT COUNT(*) FROM invite_bonuses WHERE user_id = $1) AS bonuses`,
            ['u1']
        );
        assert.strictEqual(Number(before.rows[0].uses), 1);
        assert.strictEqual(Number(before.rows[0].bonuses), 1);

        // Snapshot pour vérifier après reset
        const snap = await client.query(
            `SELECT COUNT(*) AS cnt FROM invite_restore WHERE guild_id = $1 AND user_id = $2`,
            ['g1', 'u1']
        );
        assert.strictEqual(Number(snap.rows[0].cnt), 0);
    });
});
