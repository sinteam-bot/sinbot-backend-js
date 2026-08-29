/**
 * defaults.js — Économie & Inventaire (Phase 9)
 *
 * - daily_reward : montant du /daily
 * - cooldown_hours : nombre d'heures entre deux /daily
 * - starting_balance : balance initiale donnée aux nouveaux membres
 * - tax_percent : % prélevé sur /pay (0 = pas de taxe)
 * - shop.max_items : limite dure d'items dans le shop par guild
 * - inventory.max_per_user : limite dure d'items cumulés par user
 * - drops.default_duration_min : durée par défaut d'un /dropobjet
 * - drops.max_duration_min : durée max
 * - drops.require_button : si true, claim via button (au lieu d'une emoji)
 */

module.exports = {
    enabled: false,
    allowed_roles: [],

    daily_reward: 100,
    cooldown_hours: 22,
    starting_balance: 0,
    tax_percent: 0,
    max_balance: 999999999,

    shop: {
        max_items: 100
    },

    inventory: {
        max_per_user: 200,
        max_quantity_per_item: 999
    },

    drops: {
        default_duration_min: 2,
        max_duration_min: 10,
        require_button: true
    },

    history_retention_days: 90
};
