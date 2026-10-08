module.exports = {
    enabled: true,
    check_interval_minutes: 15,
    max_feeds_per_guild: 25,
    twitch: {
        client_id: '',
        client_secret: '',
        eventsub_secret: ''
    },
    youtube: {
        api_key: ''
    },
    poll_intervals: {
        live_minutes: 2,
        video_minutes: 15,
        rss_minutes: 30
    },
    error_handling: {
        alert_after_errors: 3,
        max_consecutive_errors: 10
    },
    log_channel_id: null
};
