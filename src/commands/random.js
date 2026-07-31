const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    // Définition de la Slash Command
    data: new SlashCommandBuilder()
        .setName('random')
        .setDescription('Récupérer un aléatoire')
        .addSubcommand(subcommand =>
            subcommand
                .setName('member')
                .setDescription('Récupérer un membre aléatoire')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('grognement')
                .setDescription('Récupère un membre pour le grognement')
    ),
    
    // Exécution de la commande préfixe !ping
    async execute(message, args) {
        return ;
    },
    
    // Exécution de la Slash Command /ping
    async executeSlash(interaction) {
        try{
            if(interaction.channel.id != '1348741823237062781' ){
                await interaction.reply({
                    content: `❌ Erreur : Vous n'avez pas accès à cette commande.`,
                    ephemeral: true
                });
                return '';
            }
            const guild = interaction.guild;
            const members = await guild.members.fetch();
            const membersArray = Array.from(members.values()).filter(m => !m.user.bot);
            const randomMember = membersArray[Math.floor(Math.random() * membersArray.length)];
            interaction.reply({
                content: `Voici un membre au hasard : <@${randomMember.id}>`,
                ephemeral: true
            })
        }catch(error){
            await interaction.reply({
                content: `❌ Erreur : ${error.message}`
            });
        }
    }
};