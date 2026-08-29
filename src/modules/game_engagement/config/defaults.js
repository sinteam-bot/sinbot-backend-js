/**
 * defaults.js — Giveaways & Polls (Phase 5)
 */

module.exports = {
    enabled: false,
    allowed_roles: [],

    giveaways: {
        max_duration_days: 30,
        min_duration_minutes: 5,
        max_winners: 20,
        max_prize_length: 256,
        default_winners_count: 1,
        default_color: '#5865F2',
        dm_winners: true,
        reroll_on_empty: true,
        button_label: 'Participer',
        button_emoji: '🎉'
    },

    polls: {
        max_options: 10,
        min_options: 2,
        max_duration_days: 7,
        max_question_length: 256,
        max_option_length: 80,
        default_color: '#5865F2',
        allow_multi_choice: true,
        default_results_visible: true,
        show_results_after_vote: true
    }
};
