const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Command } = require('../../core/index.js');
const { CaptchaService } = require('./captcha.service.js');

class CaptchaCommand {
    static inject = [CaptchaService];

    constructor(service) {
        this.service = service;
    }

    async executeCommand(interaction) {
        const captcha = await this.service.repo.getUserCaptcha(interaction.user.id, interaction.guildId);
        if (captcha && captcha.is_verified) {
            await interaction.reply({
                content: '✅ Votre compte est déjà vérifié avec succès.',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '🔒 Vérification en cours. Veuillez répondre à la question de sécurité dans votre salon dédié.',
                ephemeral: true
            });
        }
    }

    async executeBorderwall(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'status') {
            const cfg = await this.service.getBorderwallConfig(guildId);
            const embed = new EmbedBuilder()
                .setColor(cfg.enabled ? 0x57F287 : 0xED4245)
                .setTitle('🛡️ État du système Borderwall (Anti-Bot / Anti-Raid)')
                .addFields(
                    { name: 'Statut', value: cfg.enabled ? '🟢 Activé (Sas de quarantaine obligatoire)' : '🔴 Désactivé (Mode standard)', inline: true },
                    { name: 'Seuil Anti-Raid', value: `${cfg.raidThreshold} arrivées en ${cfg.raidWindowSeconds}s`, inline: true },
                    { name: 'Délai d’expiration', value: `${cfg.timeoutMinutes} minutes`, inline: true },
                    { name: 'Rôle Quarantaine', value: cfg.quarantineRoleId ? `<@&${cfg.quarantineRoleId}>` : 'Aucun', inline: true }
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'set') {
            const enabled = interaction.options.getBoolean('actif');
            const threshold = interaction.options.getInteger('seuil_raid') || 5;
            const windowSec = interaction.options.getInteger('fenetre_secondes') || 10;
            const role = interaction.options.getRole('role_quarantaine');
            const timeout = interaction.options.getInteger('timeout_minutes') || 10;

            const res = await this.service.setBorderwallConfig(guildId, {
                enabled,
                raidThreshold: threshold,
                raidWindowSeconds: windowSec,
                quarantineRoleId: role?.id || null,
                timeoutMinutes: timeout
            });

            return interaction.reply({
                content: `✅ Configuration Borderwall mise à jour (Statut : ${res.enabled ? '🟢 Actif' : '🔴 Inactif'}).`,
                ephemeral: true
            });
        }
    }
}

const borderwallBuilder = new SlashCommandBuilder()
    .setName('borderwall')
    .setDescription('Configuration du sas Borderwall et protection anti-raid')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('status')
            .setDescription('Afficher la configuration actuelle de Borderwall')
    )
    .addSubcommand(sub =>
        sub.setName('set')
            .setDescription('Configurer les paramètres Borderwall')
            .addBooleanOption(o => o.setName('actif').setDescription('Activer la quarantaine obligatoire').setRequired(true))
            .addRoleOption(o => o.setName('role_quarantaine').setDescription('Rôle attribué aux membres en attente').setRequired(false))
            .addIntegerOption(o => o.setName('seuil_raid').setDescription('Nombre d’arrivées déclenchant le mode raid').setRequired(false).setMinValue(2))
            .addIntegerOption(o => o.setName('fenetre_secondes').setDescription('Fenêtre de temps en secondes pour le seuil').setRequired(false).setMinValue(3))
            .addIntegerOption(o => o.setName('timeout_minutes').setDescription('Délai avant kick si non vérifié').setRequired(false).setMinValue(1))
    );

Command({ name: 'verify', description: 'Vérifier l\'état de validation du compte' })(CaptchaCommand.prototype, 'executeCommand');
Command({ name: 'borderwall', builder: borderwallBuilder })(CaptchaCommand.prototype, 'executeBorderwall');

module.exports = {
    CaptchaCommand
};
