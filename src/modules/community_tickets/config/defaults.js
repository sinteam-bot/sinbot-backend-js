/**
 * defaults.js — valeurs par défaut de la feature Tickets (Phase 3)
 *
 * Le `allowed_roles` est vide par défaut, ce qui signifie "tous les
 * membres du staff autorisés par les permissions Discord".
 *
 * `use_threads` indique si on crée un thread (true) ou un salon
 * privé dédié (false). Les threads sont plus légers mais limités
 * à 90 jours d'historique via l'API Discord.
 */

module.exports = {
    enabled: false,
    allowed_roles: [],

    panel: {
        channel_id: null,
        title: '📩 Support',
        description: 'Clique sur le bouton ci-dessous pour ouvrir un ticket. Notre staff te répondra dès que possible.',
        color: '#5865F2',
        button_label: 'Ouvrir un ticket',
        button_emoji: '📩',
        image: null
    },

    categories: [
        {
            id: 'support',
            label: 'Support',
            emoji: '❓',
            description: 'Question ou problème général',
            staff_roles: []
        },
        {
            id: 'report',
            label: 'Signalement',
            emoji: '🚨',
            description: 'Signaler un membre ou un message',
            staff_roles: []
        },
        {
            id: 'partner',
            label: 'Partenariat',
            emoji: '🤝',
            description: 'Proposition de partenariat',
            staff_roles: []
        }
    ],

    use_threads: false,

    settings: {
        max_open_per_user: 3,
        auto_close_after_days: 7,
        transcript_channel_id: null,
        ping_staff_on_open: true,
        staff_role_to_ping: null,
        log_channel_id: null,
        close_message: '🔒 Ce ticket a été fermé par {closer}.',
        reopen_on_message: false,
        allow_user_close: false,
        confirmation_before_close: true
    },

    modal_fields: [
        { id: 'subject', label: 'Sujet', style: 'short', required: true, min_length: 3, max_length: 100 },
        { id: 'description', label: 'Description', style: 'paragraph', required: true, min_length: 20, max_length: 1500 }
    ]
};
