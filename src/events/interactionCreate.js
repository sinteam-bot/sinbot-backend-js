const { MessageFlags } = require('discord.js');
const { checkCommandPermissions } = require("../utils/commandHandler.js");

function _formatInteraction(interaction) {
    const parts = [];
    const group = interaction.options?.getSubcommandGroup?.(false);
    const sub = interaction.options?.getSubcommand?.(false);
    if (group) parts.push(group);
    if (sub) parts.push(sub);

    // Récapitulatif lisible des options ciblées (sans valeurs sensibles)
    const focused = [];
    try {
        const data = interaction.options?.data || [];
        for (const opt of data) {
            if (Array.isArray(opt.options)) {
                for (const subOpt of opt.options) {
                    if (Array.isArray(subOpt.options)) {
                        for (const inner of subOpt.options) {
                            if (inner && inner.name) focused.push(inner.name);
                        }
                    } else if (subOpt && subOpt.name) {
                        focused.push(subOpt.name);
                    }
                }
            } else if (opt && opt.name) {
                focused.push(opt.name);
            }
        }
    } catch {}

    return { parts, focused };
}

module.exports = {
    name: 'interactionCreate',

    async execute(interaction) {
        // Les boutons des modules sont traités via l'EventBus modulaire (DailyMessageEvent, etc.)
        // ou directement pour les boutons de commandes de modules (ex: pagination leaderboard XP)
        if (interaction.isButton()) {
            if (interaction.customId?.startsWith('xp:lb:')) {
                try {
                    const { container } = require('../core/container.js');
                    const { XPLevelCommand } = require('../modules/engagement_xp-level/xp-level.cmd.js');
                    const cmd = container.resolve(XPLevelCommand);
                    await cmd.handleLeaderboardButton(interaction);
                } catch (err) {
                    console.error('❌ Erreur pagination leaderboard XP:', err);
                }
                return;
            }
            return;
        }

        // Gestion des commandes slash
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`❌ Commande ${interaction.commandName} introuvable.`);
            return;
        }

        // Vérification de la configuration des permissions pour cette commande
        const permCheck = checkCommandPermissions(interaction, interaction.commandName);
        if (!permCheck.allowed) {
            await interaction.reply({
                content: permCheck.reason || '⛔ Vous n\'avez pas la permission d\'exécuter cette commande.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Vérifier si la commande a une méthode executeSlash
        if (!command.executeSlash) {
            await interaction.reply({
                content: '❌ Cette commande n\'est pas encore disponible en Slash Command.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const start = Date.now();
        const { parts, focused } = _formatInteraction(interaction);
        const fullCmd = parts.length ? `/${interaction.commandName} ${parts.join(' ')}` : `/${interaction.commandName}`;
        const optsStr = focused.length ? ` [opts: ${focused.join(', ')}]` : '';
        const userTag = interaction.user?.tag || `${interaction.user?.username}#${interaction.user?.discriminator || '0'}`;
        const channelInfo = interaction.channel
            ? `#${interaction.channel.name} (${interaction.channel.id})`
            : 'DM';

        console.log(
            `🎯 Exécution de ${fullCmd}${optsStr} par ${userTag} (id: ${interaction.user.id}) ` +
            `sur ${channelInfo} @ guild ${interaction.guild?.id || 'DM'}`
        );

        try {
            await command.executeSlash(interaction);
            const duration = Date.now() - start;
            console.log(
                `✅ ${fullCmd} terminé en ${duration}ms (par ${interaction.user.username} / ${interaction.user.id})`
            );
        } catch (error) {
            const duration = Date.now() - start;
            console.error(`❌ Erreur lors de l'exécution de ${fullCmd} (après ${duration}ms):`, error);

            const errorMessage = {
                content: '❌ Une erreur est survenue lors de l\'exécution de cette commande.',
                flags: MessageFlags.Ephemeral
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};
