// Configuration du système d'accueil
module.exports = {
    // ID du channel où envoyer les messages de bienvenue
    WELCOME_CHANNEL_ID: '',  // À configurer
    
    // IDs des rôles à attribuer automatiquement
    // Pour obtenir les IDs : Mode développeur Discord → Clic droit sur rôle → Copier l'ID
    AUTO_ROLES: [
        // Exemple :
        // '123456789012345678',  // Rôle "Membre"
        // '234567890123456789',  // Rôle "Nouveau"
    ],
    
    // Message de bienvenue (peut contenir des variables)
    // {user} = mention de l'utilisateur
    // {username} = nom de l'utilisateur
    // {server} = nom du serveur
    // {memberCount} = nombre de membres
    WELCOME_MESSAGE: {
        title: '🎉 Bienvenue sur {server} !',
        description: 'Bienvenue {user} !\n\nNous sommes ravis de t\'accueillir parmi nous ! 🎊',
        color: '#00FF00',
        footer: 'Membre #{memberCount}',
        fields: [
            {
                name: '📚 Pour commencer',
                value: '• Lis les règles dans <#CHANNEL_REGLES_ID>\n• Présente-toi dans <#CHANNEL_PRESENTATION_ID>\n• N\'hésite pas à poser des questions !',
                inline: false
            },
            {
                name: '🎮 Commandes utiles',
                value: '`/help` - Liste des commandes\n`/rank` - Voir ton niveau',
                inline: true
            }
        ],
        thumbnail: 'user',  // 'user' = avatar de l'utilisateur, ou URL d'une image
        image: null  // URL d'une image de bannière (optionnel)
    },
    
    // Activer/désactiver le système
    ENABLED: true,
    
    // Envoyer un message privé au nouveau membre
    SEND_DM: true,
    DM_MESSAGE: {
        title: '👋 Bienvenue !',
        description: 'Salut {username} !\n\nBienvenue sur **{server}** ! Nous espérons que tu vas t\'amuser avec nous. 😊',
        color: '#0099FF',
        fields: [
            {
                name: '💡 Conseil',
                value: 'N\'oublie pas de te présenter pour que la communauté apprenne à te connaître !',
                inline: false
            }
        ]
    },
    
    // Logs
    LOG_TO_CONSOLE: true
};