/**
 * src/modules/util_autofeeds/db/schema.js
 *
 * Schéma Drizzle pour les flux automatiques (Autofeeds), souscriptions, historique et sessions de live.
 */

const { pgTable, text, bigint, integer, boolean, index, unique } = require('../../../db/schemas/_drizzle.js');

const autofeeds = pgTable('autofeeds', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    feedUrl: text('feed_url').notNull(),
    name: text('name'),
    feedType: text('feed_type').default('rss').notNull(),
    category: text('category').default('general').notNull(),
    tags: text('tags').default('[]').notNull(), // JSON array
    filters: text('filters').default('{}').notNull(), // JSON object
    customMessage: text('custom_message'),
    color: text('color').default('#FF4500').notNull(),
    pingRoleId: text('ping_role_id'),
    subscriberRoleId: text('subscriber_role_id'),
    notificationDelivery: text('notification_delivery').default('channel').notNull(), // 'channel' | 'dm' | 'both'
    createThread: boolean('create_thread').default(false).notNull(),
    threadAutoArchiveDuration: integer('thread_auto_archive_duration').default(1440).notNull(),
    useWebhook: boolean('use_webhook').default(true).notNull(),
    enableMediaProxy: boolean('enable_media_proxy').default(true).notNull(),
    ignoreShorts: boolean('ignore_shorts').default(false).notNull(),
    aiSummary: boolean('ai_summary').default(false).notNull(),
    aiTranslate: text('ai_translate'),
    digestMode: text('digest_mode').default('realtime').notNull(), // 'realtime' | 'daily' | 'weekly'
    digestSchedule: text('digest_schedule').default('08:00'),
    digestChannelId: text('digest_channel_id'),
    enableGamification: boolean('enable_gamification').default(false).notNull(),
    gamificationXpReward: integer('gamification_xp_reward').default(25).notNull(),
    channelTagRouting: text('channel_tag_routing').default('{}').notNull(), // JSON: { "#tag": "channelId" }
    quietHours: text('quiet_hours').default('{}').notNull(), // JSON: { enabled: false, start: '23:00', end: '08:00', suppressMentions: true }
    maxPostsPerHour: integer('max_posts_per_hour').default(0).notNull(), // 0 = unlimited
    autoReactions: text('auto_reactions').default('[]').notNull(), // JSON array: ["🔥", "😐", "💸"]
    autoPoll: text('auto_poll').default('{}').notNull(), // JSON: { question: '...', answers: [...] }
    breakingKeywords: text('breaking_keywords').default('[]').notNull(), // JSON array: ["BREAKING", "URGENT", "CVE-"]
    bypassQuietHours: boolean('bypass_quiet_hours').default(false).notNull(),
    breakingRoleId: text('breaking_role_id'),
    autoExpireDays: integer('auto_expire_days').default(0).notNull(), // 0 = disabled
    enableAudioBriefing: boolean('enable_audio_briefing').default(false).notNull(),
    enableVoting: boolean('enable_voting').default(false).notNull(),
    bestOfThreshold: integer('best_of_threshold').default(5).notNull(),
    bestOfChannelId: text('best_of_channel_id'),
    minDiscountPercent: integer('min_discount_percent').default(0).notNull(),
    autoSyncEvents: boolean('auto_sync_events').default(false).notNull(),
    goodVibesOnly: boolean('good_vibes_only').default(false).notNull(),
    enableSecurityScan: boolean('enable_security_scan').default(true).notNull(),
    translateTitleToFr: boolean('translate_title_to_fr').default(false).notNull(),
    antiClickbait: boolean('anti_clickbait').default(false).notNull(),
    requireApproval: boolean('require_approval').default(false).notNull(),
    moderationChannelId: text('moderation_channel_id'),
    enableStoryClustering: boolean('enable_story_clustering').default(false).notNull(),
    clusterMode: text('cluster_mode').default('merge').notNull(), // 'merge' | 'skip'
    enableVideoSummary: boolean('enable_video_summary').default(false).notNull(),
    autoSmartTag: boolean('auto_smart_tag').default(false).notNull(),
    syncToKnowledgeBase: boolean('sync_to_knowledge_base').default(false).notNull(),
    knowledgeBaseType: text('knowledge_base_type').default('markdown').notNull(), // 'markdown' | 'webhook'
    knowledgeWebhookUrl: text('knowledge_webhook_url'),
    lastItemId: text('last_item_id'),
    lastItemPublishedAt: bigint('last_item_published_at', { mode: 'number' }).default(0).notNull(),
    intervalMinutes: integer('interval_minutes').default(15).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    lastCheckedAt: bigint('last_checked_at', { mode: 'number' }).default(0).notNull(),
    lastStatus: text('last_status').default('ok').notNull(),
    lastError: text('last_error'),
    failCount: integer('fail_count').default(0).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' })
}, (table) => [
    index('idx_autofeeds_guild').on(table.guildId),
    index('idx_autofeeds_category').on(table.category)
]);

const autofeedSubscriptions = pgTable('autofeed_subscriptions', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    targetType: text('target_type').notNull(), // 'tag', 'category', 'feed', 'keyword', 'account', 'author'
    targetValue: text('target_value').notNull(), // 'steam', 'gaming', 'id_du_feed', 'PlayStation', 'zerator'
    notifyMode: text('notify_mode').default('mention').notNull(), // 'mention', 'dm', 'both', 'role'
    filters: text('filters').default('{}').notNull(), // JSON: { includeKeywords: [], excludeKeywords: [], regexFilter: '' }
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    unique('autofeed_subs_unique').on(table.guildId, table.userId, table.targetType, table.targetValue),
    index('idx_autofeed_subs_lookup').on(table.guildId, table.targetType, table.targetValue),
    index('idx_autofeed_subs_user').on(table.guildId, table.userId)
]);

const autofeedHistory = pgTable('autofeed_history', {
    id: text('id').primaryKey(),
    feedId: text('feed_id').notNull(),
    guildId: text('guild_id'),
    channelId: text('channel_id'),
    messageId: text('message_id'),
    itemGuid: text('item_guid').notNull(),
    itemUrl: text('item_url'),
    canonicalUrl: text('canonical_url'),
    itemTitle: text('item_title'),
    itemAuthor: text('item_author'),
    itemContent: text('item_content'),
    tags: text('tags').default('[]').notNull(),
    isDigest: boolean('is_digest').default(false).notNull(),
    clicksCount: integer('clicks_count').default(0).notNull(),
    isExpired: boolean('is_expired').default(false).notNull(),
    clusteredWithId: text('clustered_with_id'),
    relatedSources: text('related_sources').default('[]').notNull(), // JSON: [{ name, url }]
    isBestOf: boolean('is_best_of').default(false).notNull(),
    sentimentScore: text('sentiment_score'),
    isPendingApproval: boolean('is_pending_approval').default(false).notNull(),
    approvedBy: text('approved_by'),
    rejectedBy: text('rejected_by'),
    releaseDate: text('release_date'),
    factCheckScore: integer('fact_check_score'),
    postedAt: bigint('posted_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_autofeed_hist_lookup').on(table.feedId, table.itemGuid),
    index('idx_autofeed_hist_guild').on(table.guildId)
]);

const autofeedPriceHistory = pgTable('autofeed_price_history', {
    id: text('id').primaryKey(),
    feedId: text('feed_id').notNull(),
    itemUrl: text('item_url').notNull(),
    itemTitle: text('item_title'),
    originalPrice: text('original_price'),
    currentPrice: text('current_price'),
    discountPercent: integer('discount_percent').default(0).notNull(),
    currency: text('currency').default('EUR').notNull(),
    isAllTimeLow: boolean('is_all_time_low').default(false).notNull(),
    recordedAt: bigint('recorded_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_autofeed_price_url').on(table.itemUrl),
    index('idx_autofeed_price_feed').on(table.feedId)
]);

const autofeedClaims = pgTable('autofeed_claims', {
    id: text('id').primaryKey(),
    feedId: text('feed_id').notNull(),
    itemId: text('item_id').notNull(),
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    xpAwarded: integer('xp_awarded').default(0).notNull(),
    claimedAt: bigint('claimed_at', { mode: 'number' }).notNull()
}, (table) => [
    unique('autofeed_claims_unique').on(table.feedId, table.itemId, table.userId),
    index('idx_autofeed_claims_item').on(table.feedId, table.itemId),
    index('idx_autofeed_claims_user').on(table.guildId, table.userId)
]);

const autofeedLiveSessions = pgTable('autofeed_live_sessions', {
    id: text('id').primaryKey(),
    feedId: text('feed_id').notNull(),
    streamId: text('stream_id').notNull(),
    streamerName: text('streamer_name').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id').notNull(),
    threadId: text('thread_id'),
    title: text('title'),
    game: text('game'),
    url: text('url'),
    startedAt: bigint('started_at', { mode: 'number' }).notNull(),
    endedAt: bigint('ended_at', { mode: 'number' }),
    status: text('status').default('live').notNull(), // 'live' | 'offline'
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_live_session_lookup').on(table.feedId, table.streamId),
    index('idx_live_session_status').on(table.feedId, table.status)
]);

const autofeedUserDigests = pgTable('autofeed_user_digests', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    scheduleTime: text('schedule_time').default('08:00').notNull(), // 'HH:mm'
    isEnabled: boolean('is_enabled').default(true).notNull(),
    lastSentAt: bigint('last_sent_at', { mode: 'number' }).default(0).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    unique('autofeed_user_digest_unique').on(table.guildId, table.userId),
    index('idx_user_digest_schedule').on(table.scheduleTime, table.isEnabled)
]);

const autofeedReleaseReminders = pgTable('autofeed_release_reminders', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    historyId: text('history_id'),
    itemTitle: text('item_title').notNull(),
    itemUrl: text('item_url'),
    targetDate: text('target_date').notNull(), // 'YYYY-MM-DD'
    isNotified: boolean('is_notified').default(false).notNull(),
    notifiedAt: bigint('notified_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_release_reminders_target').on(table.targetDate, table.isNotified),
    index('idx_release_reminders_user').on(table.guildId, table.userId)
]);

const autofeedTriviaQuizzes = pgTable('autofeed_trivia_quizzes', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id'),
    messageId: text('message_id'),
    theme: text('theme').default('Actualités de la Semaine').notNull(),
    question: text('question').notNull(),
    options: text('options').notNull(), // JSON: ["Option A", "Option B", "Option C", "Option D"]
    correctOptionIndex: integer('correct_option_index').notNull(),
    explanation: text('explanation').notNull(),
    sourceUrl: text('source_url'),
    xpReward: integer('xp_reward').default(50).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_trivia_guild_active').on(table.guildId, table.isActive)
]);

const autofeedTriviaAnswers = pgTable('autofeed_trivia_answers', {
    id: text('id').primaryKey(),
    quizId: text('quiz_id').notNull(),
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    selectedOptionIndex: integer('selected_option_index').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    xpEarned: integer('xp_earned').default(0).notNull(),
    answeredAt: bigint('answered_at', { mode: 'number' }).notNull()
}, (table) => [
    unique('autofeed_trivia_answer_unique').on(table.quizId, table.userId)
]);

const autofeedPredictions = pgTable('autofeed_predictions', {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    feedId: text('feed_id'),
    historyId: text('history_id'),
    title: text('title').notNull(),
    description: text('description'),
    sourceUrl: text('source_url'),
    options: text('options').notNull(), // JSON: ["Oui", "Non"] ou [...]
    status: text('status').default('open').notNull(), // 'open' | 'locked' | 'resolved' | 'cancelled'
    resolvedOptionIndex: integer('resolved_option_index'),
    totalPoolXp: integer('total_pool_xp').default(0).notNull(),
    closesAt: bigint('closes_at', { mode: 'number' }),
    resolvedAt: bigint('resolved_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pred_guild_status').on(table.guildId, table.status)
]);

const autofeedPredictionBets = pgTable('autofeed_prediction_bets', {
    id: text('id').primaryKey(),
    predictionId: text('prediction_id').notNull(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    optionIndex: integer('option_index').notNull(),
    amountXp: integer('amount_xp').notNull(),
    payoutXp: integer('payout_xp').default(0).notNull(),
    isClaimed: boolean('is_claimed').default(false).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (table) => [
    index('idx_pred_bets_lookup').on(table.predictionId, table.userId)
]);

module.exports = {
    autofeeds,
    autofeedSubscriptions,
    autofeedHistory,
    autofeedPriceHistory,
    autofeedClaims,
    autofeedLiveSessions,
    autofeedUserDigests,
    autofeedReleaseReminders,
    autofeedTriviaQuizzes,
    autofeedTriviaAnswers,
    autofeedPredictions,
    autofeedPredictionBets
};
