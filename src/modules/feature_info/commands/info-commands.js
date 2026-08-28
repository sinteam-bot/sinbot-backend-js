/**
 * Slash commands /serverinfo, /userinfo, /avatar
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { InfoService } = require('../services/info.service.js');

class InfoCommands {
    static inject = [InfoService];

    constructor(info) {
        this.info = info;
    }

    async executeServerInfo(interaction) {
        const embed = this.info.buildServerEmbed(interaction.guild, getConfig().features?.info);
        return interaction.reply({ embeds: [embed] });
    }

    async executeUserInfo(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const embed = this.info.buildUserEmbed(user, member, getConfig().features?.info);
        return interaction.reply({ embeds: [embed] });
    }

    async executeAvatar(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const url = this.info.getAvatarUrl(user, { size: 1024 });
        if (!url) {
            return interaction.reply({ content: '❌ Pas d\'avatar disponible', ephemeral: true });
        }
        const embed = new EmbedBuilder()
            .setColor(getConfig().features?.info?.color ? parseInt(getConfig().features.info.color.replace('#', ''), 16) : 0x5865f2)
            .setTitle(`🖼️ Avatar de ${user.username}`)
            .setImage(url)
            .setURL(url)
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
}

const serverInfoBuilder = new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Voir les informations du serveur');

const userInfoBuilder = new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Voir les informations d\'un utilisateur')
    .addUserOption(o => o.setName('user').setDescription('Cible (par défaut toi-même)').setRequired(false));

const avatarBuilder = new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Voir l\'avatar d\'un utilisateur')
    .addUserOption(o => o.setName('user').setDescription('Cible (par défaut toi-même)').setRequired(false));

Command({ name: 'serverinfo', builder: serverInfoBuilder })(InfoCommands.prototype, 'executeServerInfo');
Command({ name: 'userinfo', builder: userInfoBuilder })(InfoCommands.prototype, 'executeUserInfo');
Command({ name: 'avatar', builder: avatarBuilder })(InfoCommands.prototype, 'executeAvatar');

module.exports = { InfoCommands };
