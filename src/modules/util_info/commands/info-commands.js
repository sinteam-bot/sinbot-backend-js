/**
 * Slash command /info avec sous-commandes (server, user, avatar)
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { InfoService } = require('../services/info.service.js');

class InfoCommands {
    static inject = [InfoService];

    static __commandBuilder = new SlashCommandBuilder()
        .setName('info')
        .setDescription('Afficher des informations sur le serveur, un membre ou un avatar')
        .addSubcommand(sub =>
            sub.setName('server')
                .setDescription('Voir les informations du serveur')
        )
        .addSubcommand(sub =>
            sub.setName('user')
                .setDescription('Voir les informations d\'un utilisateur')
                .addUserOption(o => o.setName('user').setDescription('Cible (par défaut toi-même)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('avatar')
                .setDescription('Voir l\'avatar d\'un utilisateur')
                .addUserOption(o => o.setName('user').setDescription('Cible (par défaut toi-même)').setRequired(false))
        );

    constructor(info) {
        this.info = info;
    }

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'server': return this.executeServerInfo(interaction);
            case 'user':   return this.executeUserInfo(interaction);
            case 'avatar': return this.executeAvatar(interaction);
            default:
                return this.executeServerInfo(interaction);
        }
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

Command({ name: 'info', description: 'Afficher des informations' })(InfoCommands.prototype, 'execute');

module.exports = { InfoCommands };
