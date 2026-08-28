/**
 * defaults.js — feature Reaction Roles (Phase RR)
 *
 * - enabled : active la feature (toggle par le dashboard)
 * - allowed_roles : rôles Discord autorisés à utiliser /reactionrole
 * - max_per_message : limite dure de combinaisons emoji↔role par message
 * - unique_per_user : si true, un user ne peut avoir qu'un seul des rôles
 *   du groupe (géré côté listener)
 * - self_assignable : si true, les users peuvent s'auto-assigner le rôle.
 *   Si false, il faut être staff (Manage Roles) pour assigner.
 */

module.exports = {
    enabled: false,
    allowed_roles: [],
    max_per_message: 25,
    unique_per_user: false,
    self_assignable: true
};
