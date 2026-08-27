/**
 * /anniversaire set|list|enable|disable|retirer|config
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { BirthdayService } = require('../services/birthday.service.js');

function isAdmin(interaction) {
    return interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
}

class BirthdayCommands {
    static inject = [BirthdayService];

    constructor(birthday) {
        this.birthday = birthday;
    }

    async executeSet(interaction) {
        const date = interaction.options.getString('date');
        const r = await this.birthday.setBirthday({
            userId: interaction.user.id,
            username: interaction.user.username,
            guildId: interaction.guild.id,
            birthdate: date
        });
        if (!r.ok) {
            if (r.error === 'cooldown') {
                const days = Math.ceil((r.nextChangeAt - Date.now()) / 86400_000);
                return interaction.reply({ content: `❌ Tu dois attendre encore ~${days} jour(s) avant de pouvoir modifier ton anniversaire.`, ephemeral: true });
            }
            const messages = {
                empty: '❌ Date vide',
                invalid_format: '❌ Format invalide. Utilise JJ/MM ou YYYY-MM-DD',
                invalid_date: '❌ Date invalide (jour/mois)',
                missing_params: '❌ Paramètres manquants'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Anniversaire enregistré : **${r.birthdate}**`, ephemeral: true });
    }

    async executeList(interaction) {
        const list = await this.birthday.listUpcoming(interaction.guild.id, 30);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun anniversaire à venir', ephemeral: true });
        }
        const top10 = list.slice(0, 10);
        const lines = top10.map(b => `**${b.days_until === 0 ? '🎂 Aujourd\'hui' : `J-${b.days_until}`}** — <@${b.userId}> (${b.age} ans)`);
        const embed = new EmbedBuilder()
            .setColor(0xf2c7ce)
            .setTitle('🎂 10 prochains anniversaires')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    async executeEnable(interaction) {
        await this.birthday.setVisibility(interaction.user.id, interaction.guild.id, true);
        return interaction.reply({ content: '✅ Ton anniversaire est visible sur ce serveur', ephemeral: true });
    }

    async executeDisable(interaction) {
        await this.birthday.setVisibility(interaction.user.id, interaction.guild.id, false);
        return interaction.reply({ content: '✅ Ton anniversaire est masqué sur ce serveur', ephemeral: true });
    }

    async executeRetirer(interaction) {
        await this.birthday.removeBirthday(interaction.user.id, null);
        return interaction.reply({ content: '✅ Ton anniversaire a été retiré (BDD globale)', ephemeral: true });
    }

    async executeConfig(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ Réservé aux administrateurs', ephemeral: true });
        }
        const field = interaction.options.getString('field');
        const value = interaction.options.getString('value');
        const validFields = ['mode', 'announce_channel_id', 'announce_hour', 'announce_timezone', 'ping_role_id', 'message_template', 'temp_role_id', 'enabled'];
        if (!validFields.includes(field)) {
            return interaction.reply({ content: `❌ Champ invalide. Champs: ${validFields.join(', ')}`, ephemeral: true });
        }
        let parsed = value;
        if (field === 'enabled') parsed = value === 'true';
        if (field === 'announce_hour') parsed = parseInt(value, 10);
        await this.birthday.updateSettings(interaction.guild.id, { [field]: parsed });
        return interaction.reply({ content: `✅ Config mise à jour : **${field}** = \`${value}\``, ephemeral: true });
    }
}

const setBuilder = new SlashCommandBuilder()
    .setName('anniversaire-set')
    .setDescription('Définir ta date d\'anniversaire')
    .addStringOption(o => o.setName('date').setDescription('Date (JJ/MM ou YYYY-MM-DD)').setRequired(true).setMaxLength(10));

const listBuilder = new SlashCommandBuilder()
    .setName('anniversaire-list')
    .setDescription('Lister les 10 prochains anniversaires du serveur');

const enableBuilder = new SlashCommandBuilder()
    .setName('anniversaire-enable')
    .setDescription('Afficher ton anniversaire sur ce serveur');

const disableBuilder = new SlashCommandBuilder()
    .setName('anniversaire-disable')
    .setDescription('Masquer ton anniversaire sur ce serveur');

const retirerBuilder = new SlashCommandBuilder()
    .setName('anniversaire-retirer')
    .setDescription('Supprimer ton anniversaire de la BDD globale');

const configBuilder = new SlashCommandBuilder()
    .setName('anniversaire-config')
    .setDescription('Modifier la config (admin)')
    .addStringOption(o => o.setName('field').setDescription('Champ (mode, announce_channel_id, ...)').setRequired(true))
    .addStringOption(o => o.setName('value').setDescription('Valeur').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

Command({ name: 'anniversaire-set', builder: setBuilder })(BirthdayCommands.prototype, 'executeSet');
Command({ name: 'anniversaire-list', builder: listBuilder })(BirthdayCommands.prototype, 'executeList');
Command({ name: 'anniversaire-enable', builder: enableBuilder })(BirthdayCommands.prototype, 'executeEnable');
Command({ name: 'anniversaire-disable', builder: disableBuilder })(BirthdayCommands.prototype, 'executeDisable');
Command({ name: 'anniversaire-retirer', builder: retirerBuilder })(BirthdayCommands.prototype, 'executeRetirer');
Command({ name: 'anniversaire-config', builder: configBuilder })(BirthdayCommands.prototype, 'executeConfig');

module.exports = { BirthdayCommands };
