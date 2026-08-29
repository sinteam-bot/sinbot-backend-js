/**
 * StatsController — endpoints REST pour les stats
 *
 *   GET /api/stats/overview        : KPIs globaux
 *   GET /api/stats/messages?days=7 : messages par jour
 *   GET /api/stats/members?days=30: croissance membres
 *   GET /api/stats/moderation      : action counts
 */

const { Controller, Get } = require('../../../core/index.js');
const { StatsService } = require('../services/stats.service.js');
const { config } = require('../../../config/index.js');

function resolveGuildId(req) {
  if (req?.query?.guild_id) return req.query.guild_id;
  if (process.env.GUILD_ID) return process.env.GUILD_ID;
  if (process.env.NODE_ENV !== 'test' && config.discord?.guild_id) return config.discord.guild_id;
  return null;
}

class StatsController {
  static inject = [StatsService];

  constructor (stats) {
    this.stats = stats;
  }

  async overview(req) {
    try {
      const guildId = resolveGuildId(req);
      if (!guildId) return { success: false, error: 'guild_id requis' };
      const data = await this.stats.overview(guildId);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async messagesByDay(req) {
    try {
      const guildId = resolveGuildId(req);
      if (!guildId) return { success: false, error: 'guild_id requis' };
      const days = Math.min(parseInt(req.query.days) || 7, 90);
      const data = await this.stats.messagesByDay(guildId, days);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async memberGrowth(req) {
    try {
      const guildId = resolveGuildId(req);
      if (!guildId) return { success: false, error: 'guild_id requis' };
      const days = Math.min(parseInt(req.query.days) || 30, 90);
      const data = await this.stats.memberGrowth(guildId, days);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async moderationStats(req) {
    try {
      const guildId = resolveGuildId(req);
      if (!guildId) return { success: false, error: 'guild_id requis' };
      const weeks = Math.min(parseInt(req.query.weeks) || 4, 12);
      const data = await this.stats.moderationByWeek(guildId, weeks);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

Controller('/api/stats')(StatsController);
Get('/overview')(StatsController.prototype, 'overview');
Get('/messages')(StatsController.prototype, 'messagesByDay');
Get('/members')(StatsController.prototype, 'memberGrowth');
Get('/moderation')(StatsController.prototype, 'moderationStats');

module.exports = { StatsController };
