/**
 * ReactionListener — reactionAdd/Remove (v1) + interactionCreate (v2)
 *
 * v1 : applique les roles sur reaction emoji
 * v2 : dispatch les buttons et select menus (custom_id préfixé `ir:`)
 *      vers le InteractiveMessageBuilder partagé
 */

const { OnEvent } = require('../../../core/index.js');
const { featureRegistry } = require('../../../core/feature-registry.js');
const { ReactionRolesService } = require('../services/reaction-roles.service.js');
const { InteractiveMessageBuilder } = require('../../../services/interactive-message-builder.js');

class ReactionListener {
    static inject = [ReactionRolesService];

    constructor(service) {
        this.service = service;
        this.builder = new InteractiveMessageBuilder();
    }

    async _ensureEnabled(guildId) {
        const state = await featureRegistry.get(guildId, 'reaction-roles');
        return state.enabled ? state.config : null;
    }

    // =================== v1 : emoji reactions ===================

    async onReactionAdd(reaction, user) {
        if (!reaction?.message?.guild) return;
        if (user?.bot) return;
        const cfg = await this._ensureEnabled(reaction.message.guild.id);
        if (!cfg) return;

        const rr = await this.service.findForReaction(reaction.message.id, reaction.emoji);
        if (!rr) return;
        if (cfg.self_assignable === false) {
            const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
            if (!member?.permissions?.has?.('ManageRoles')) return;
        }

        try {
            const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
            if (!member) return;

            const mode = rr.mode || 'toggle';

            if (mode === 'reversed') {
                if (member.roles.cache.has(rr.roleId)) {
                    await member.roles.remove(rr.roleId);
                }
            } else if (mode === 'temporary') {
                if (!member.roles.cache.has(rr.roleId)) {
                    await member.roles.add(rr.roleId);
                }
                const durationSec = rr.metadata?.duration || 60;
                setTimeout(async () => {
                    const freshMember = await reaction.message.guild.members.fetch(user.id).catch(() => null);
                    if (freshMember && freshMember.roles.cache.has(rr.roleId)) {
                        await freshMember.roles.remove(rr.roleId).catch(() => { });
                    }
                }, durationSec * 1000);
            } else {
                // 'toggle' ou 'binding'
                if (!member.roles.cache.has(rr.roleId)) {
                    await member.roles.add(rr.roleId);
                }
            }
        } catch (err) {
            console.warn(`[ReactionListener] add failed: ${err.message}`);
        }
    }

    async onReactionRemove(reaction, user) {
        if (!reaction?.message?.guild) return;
        if (user?.bot) return;
        const cfg = await this._ensureEnabled(reaction.message.guild.id);
        if (!cfg) return;

        const rr = await this.service.findForReaction(reaction.message.id, reaction.emoji);
        if (!rr) return;

        const mode = rr.mode || 'toggle';
        if (mode === 'binding' || mode === 'temporary') {
            // Mode binding ou temporary : on ne retire pas le rôle lors du retrait du réact
            return;
        }

        try {
            const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
            if (!member) return;

            if (mode === 'reversed') {
                if (!member.roles.cache.has(rr.roleId)) {
                    await member.roles.add(rr.roleId);
                }
            } else {
                // 'toggle'
                if (member.roles.cache.has(rr.roleId)) {
                    await member.roles.remove(rr.roleId);
                }
            }
        } catch (err) {
            console.warn(`[ReactionListener] remove failed: ${err.message}`);
        }
    }

    // =================== v2 : buttons + select menus ===================

    async onInteractionCreate(interaction) {
        if (!interaction?.guild) return;
        if (interaction.isCommand?.()) return; // ignore slash commands
        if (!interaction.customId || !interaction.customId.startsWith('ir:')) return;
        if (interaction.user?.bot) return;

        const cfg = await this._ensureEnabled(interaction.guild.id);
        if (!cfg) return;

        // Trouve le component (button ou select) sur le message
        const comp = await this.service.findForCustomId(
            interaction.message?.id || interaction.channelId,
            interaction.customId
        );
        if (!comp) return;

        // Vérifie que c'est un button ou un select
        if (comp.kind !== 'button' && comp.kind !== 'select') return;

        // Garde-fou self-assignable
        if (cfg.self_assignable === false) {
            const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            if (!member?.permissions?.has?.('ManageRoles')) {
                return interaction.reply({ content: '❌ Les rôles auto-assignables sont désactivés.', ephemeral: true });
            }
        }

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            // Reconstitute le component pour le builder
            const fullComp = { kind: comp.kind, ...(comp.metadata || {}), roleId: comp.roleId };
            const r = await this.builder.execute(interaction, fullComp, member);
            if (r.ok) {
                const messages = {
                    added: `✅ Rôle <@&${comp.roleId}> ajouté.`,
                    removed: `✅ Rôle <@&${comp.roleId}> retiré.`,
                    opened_url: '✅',
                    select_applied: `✅ ${r.count} rôle(s) ajouté(s).`,
                    no_selection: '✅'
                };
                const content = messages[r.action] || '✅';
                if (interaction.deferred || interaction.replied) {
                    return interaction.followUp({ content, ephemeral: true });
                }
                return interaction.reply({ content, ephemeral: true });
            }
            return interaction.reply({ content: `❌ ${r.error || 'Erreur'}`, ephemeral: true });
        } catch (err) {
            console.warn(`[ReactionListener] interaction failed: ${err.message}`);
            if (!interaction.replied) {
                return interaction.reply({ content: '❌ Erreur interne', ephemeral: true });
            }
        }
    }

    async onMessageDelete(message) {
        if (!message?.guild) return;
        try {
            await this.service.deleteByMessage(message.guild.id, message.id);
        } catch (err) {
            console.warn(`[ReactionListener] cleanup failed: ${err.message}`);
        }
    }
}

OnEvent('messageReactionAdd', { configKey: 'features.reaction-roles', priority: 30 })(ReactionListener.prototype, 'onReactionAdd');
OnEvent('messageReactionRemove', { configKey: 'features.reaction-roles', priority: 30 })(ReactionListener.prototype, 'onReactionRemove');
OnEvent('messageDelete', { configKey: 'features.reaction-roles', priority: 30 })(ReactionListener.prototype, 'onMessageDelete');
OnEvent('interactionCreate', { configKey: 'features.reaction-roles', priority: 30 })(ReactionListener.prototype, 'onInteractionCreate');

module.exports = { ReactionListener };
