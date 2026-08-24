const { EmbedBuilder } = require('discord.js');
const { Command } = require('../../core/index.js');
const { XPLevelService } = require('./xp-level.service.js');

class XPLevelCommand {
    static inject = [XPLevelService];

    constructor(service) {
        this.service = service;
    }

    async executeRank(interaction) {
        const targetUser = interaction.options?.getUser?.('user') || interaction.user;
        const profile = await this.service.getUserProfile(targetUser.id, targetUser.username);

        const embed = new EmbedBuilder()
            .setColor('#f2c7ce')
            .setTitle(`⭐ Profil XP de ${profile.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🏆 Rang', value: `#${profile.rank}`, inline: true },
                { name: '🎖️ Niveau', value: `${profile.level}`, inline: true },
                { name: '✨ Total XP', value: `${profile.totalXp.toLocaleString('fr-FR')} XP`, inline: true },
                { name: '📊 Progression', value: `Niveau ${profile.level} [${profile.progress.progressPercent}%] -> Niveau ${profile.level + 1}\n\`${profile.progress.xpInCurrentLevel} / ${profile.progress.xpNeededForNext} XP\``, inline: false },
                { name: '💬 Messages', value: `${profile.messagesCount}`, inline: true },
                { name: '🎤 Vocal', value: `${profile.voiceMinutes} min`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    async executeLeaderboard(interaction) {
        const leaderboard = await this.service.getLeaderboard(10);

        if (!leaderboard || leaderboard.length === 0) {
            await interaction.reply({ content: '📊 Aucun membre dans le classement pour le moment.', ephemeral: true });
            return;
        }

        const lines = leaderboard.map((u, i) => {
            const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '👤'));
            return `${medal} **#${u.rank} ${u.username}** • Niveau **${u.level}** (${u.totalXp.toLocaleString('fr-FR')} XP)`;
        });

        const embed = new EmbedBuilder()
            .setColor('#f2c7ce')
            .setTitle('🏆 Top 10 - Classement XP')
            .setDescription(lines.join('\n\n'))
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
}

Command({ name: 'rank', description: 'Afficher votre niveau et votre progression d\'XP' })(XPLevelCommand.prototype, 'executeRank');
Command({ name: 'leaderboard', description: 'Afficher le classement des membres les plus actifs' })(XPLevelCommand.prototype, 'executeLeaderboard');

module.exports = {
    XPLevelCommand
};
