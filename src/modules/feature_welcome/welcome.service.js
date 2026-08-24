const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { config, getConfig } = require('../../config/index.js');
const welcomeConfig = require('./welcome.config.js');

class WelcomeService {
    constructor() {}

    getConfig() {
        const currentConfig = getConfig ? getConfig() : config;
        return currentConfig.welcome || {};
    }

    /**
     * Traite l'accueil complet d'un nouveau membre (rôles, message public, DM)
     */
    async handleWelcome(member) {
        if (!member || member.user?.bot) return;

        const conf = this.getConfig();
        if (conf.enabled === false) return;

        await this.assignAutoRoles(member);
        await this.sendPublicWelcome(member);
        await this.sendDmWelcome(member);
    }

    /**
     * Attribue les rôles automatiques à l'arrivée
     */
    async assignAutoRoles(member) {
        const autoRoles = welcomeConfig.AUTO_ROLES || [];
        if (!Array.isArray(autoRoles) || autoRoles.length === 0) return;

        for (const roleId of autoRoles) {
            try {
                if (roleId) {
                    await member.roles.add(roleId);
                    console.log(`🎖️ [Welcome] Rôle auto (${roleId}) attribué à ${member.user.tag}`);
                }
            } catch (err) {
                console.error(`❌ [Welcome] Erreur ajout rôle auto (${roleId}):`, err.message);
            }
        }
    }

    /**
     * Envoie l'embed de bienvenue dans le salon public
     */
    async sendPublicWelcome(member) {
        const welcomeMsgConf = welcomeConfig.WELCOME_MESSAGE;
        const channelId = welcomeConfig.WELCOME_CHANNEL_ID;

        if (!welcomeMsgConf || welcomeMsgConf.enabled === false || !channelId) return;

        try {
            const channel = await member.guild.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) return;

            const embed = new EmbedBuilder()
                .setColor(welcomeMsgConf.color || welcomeConfig.welcome_color || '#f2c7ce')
                .setTitle(welcomeMsgConf.title?.replace('{server}', member.guild.name) || `🎉 Bienvenue sur ${member.guild.name} !`)
                .setDescription(
                    welcomeMsgConf.description
                        ?.replace('{user}', `<@${member.id}>`)
                        ?.replace('{username}', member.user.username)
                        ?.replace('{server}', member.guild.name)
                        ?.replace('{memberCount}', member.guild.memberCount) || `Bienvenue <@${member.id}> !`
                )
                .setFooter({ text: welcomeMsgConf.footer?.replace('{memberCount}', member.guild.memberCount) || `Membre #${member.guild.memberCount}` })
                .setTimestamp();

            if (welcomeMsgConf.thumbnail === 'user') {
                embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
            } else if (welcomeMsgConf.thumbnail) {
                embed.setThumbnail(welcomeMsgConf.thumbnail);
            }

            if (welcomeMsgConf.image) {
                embed.setImage(welcomeMsgConf.image);
            }

            if (Array.isArray(welcomeMsgConf.fields)) {
                for (const f of welcomeMsgConf.fields) {
                    embed.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                }
            }

            await channel.send({ embeds: [embed] });
            console.log(`🎉 [Welcome] Message de bienvenue public envoyé pour ${member.user.tag}`);
        } catch (err) {
            console.error('❌ [Welcome] Erreur envoi message public:', err.message);
        }
    }

    /**
     * Envoie le message de bienvenue en message privé
     */
    async sendDmWelcome(member) {
        const dmConf = welcomeConfig.DM_MESSAGE;
        if (!welcomeConfig.SEND_DM || !dmConf || dmConf.enabled === false) return;

        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(dmConf.color || '#f2c7ce')
                .setTitle(dmConf.title?.replace('{server}', member.guild.name) || '👋 Bienvenue !')
                .setDescription(
                    dmConf.description
                        ?.replace('{user}', `<@${member.id}>`)
                        ?.replace('{username}', member.user.username)
                        ?.replace('{server}', member.guild.name) || `Salut ${member.user.username} !`
                );

            if (Array.isArray(dmConf.fields)) {
                for (const f of dmConf.fields) {
                    dmEmbed.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                }
            }

            await member.send({ embeds: [dmEmbed] });
            console.log(`📩 [Welcome] DM de bienvenue envoyé à ${member.user.tag}`);
        } catch (err) {
            console.warn(`⚠️ [Welcome] Impossible d'envoyer un DM de bienvenue à ${member.user.tag}:`, err.message);
        }
    }

    getStatus() {
        const conf = this.getConfig();
        return {
            enabled: conf.enabled !== false,
            channelId: welcomeConfig.WELCOME_CHANNEL_ID || null,
            autoRoles: welcomeConfig.AUTO_ROLES || [],
            sendDm: welcomeConfig.SEND_DM
        };
    }
}

Injectable()(WelcomeService);

module.exports = {
    WelcomeService
};
