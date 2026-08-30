const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../core/index.js');
const { getWelcomeConfig, saveWelcomeConfig } = require('./welcome.config.js');

const DEFAULT_WELCOME_MESSAGE = {
    title: '🎉 Bienvenue sur {server} !',
    description: 'Bienvenue {user} !\n\nNous sommes ravis de t\'accueillir parmi nous ! 🎊',
    color: '#f2c7ce',
    footer: 'Membre #{memberCount}',
    thumbnail: 'user',
    image: null,
    fields: [],
    enabled: true
};

const DEFAULT_DM_MESSAGE = {
    title: '👋 Bienvenue !',
    description: 'Salut {username} !\n\nBienvenue sur **{server}** !',
    color: '#f2c7ce',
    fields: [],
    enabled: true
};

const DEFAULT_MILESTONES = {
    enabled: false,
    channel_id: null,
    thresholds: [10, 50, 100, 500, 1000, 5000],
    template: '🎯 Le serveur passe à {count} membres !',
    announced: {}
};

const DEFAULT_LEAVE = {
    enabled: false,
    channel_id: null,
    template: 'leave',
    message: ':outbox_tray: {member} a quitté le serveur.',
    color: '#ed4245'
};

function fillDefaults(cfg = {}) {
    return {
        enabled: cfg.enabled !== false,
        channel_id: cfg.channel_id || '',
        welcome_color: cfg.welcome_color || '#f2c7ce',
        AUTO_ROLES: cfg.AUTO_ROLES || cfg.auto_roles || [],
        welcome_message: { ...DEFAULT_WELCOME_MESSAGE, ...(cfg.welcome_message || {}) },
        dm_message: { ...DEFAULT_DM_MESSAGE, ...(cfg.dm_message || {}) },
        card: { template: cfg.card?.template || 'welcome' },
        milestones: { ...DEFAULT_MILESTONES, ...(cfg.milestones || {}) },
        leave: { ...DEFAULT_LEAVE, ...(cfg.leave || {}) }
    };
}

function applyReplacements(str, replacements) {
    if (typeof str !== 'string') return str;
    let out = str;
    for (const [key, value] of Object.entries(replacements)) {
        out = out.replaceAll(`{${key}}`, String(value));
    }
    return out;
}

class WelcomeService {
    constructor() {}

    /**
     * Charge la config welcome d'une guilde.
     */
    async _load(guildId) {
        const cfg = await getWelcomeConfig(guildId);
        return fillDefaults(cfg);
    }

    /**
     * Traite l'accueil complet d'un nouveau membre (rôles, message public, DM)
     */
    async handleWelcome(member) {
        if (!member || member.user?.bot) return;

        const guildId = member.guild?.id;
        if (!guildId) return;

        const conf = await this._load(guildId);
        if (conf.enabled === false) return;

        await this.assignAutoRoles(member, conf);
        await this.sendPublicWelcome(member, conf);
        await this.sendDmWelcome(member, conf);
    }

    /**
     * Attribue les rôles automatiques à l'arrivée
     */
    async assignAutoRoles(member, conf = null) {
        const guildId = member.guild?.id;
        const cfg = conf || await this._load(guildId);
        const autoRoles = cfg.AUTO_ROLES || [];
        if (!Array.isArray(autoRoles) || autoRoles.length === 0) return;

        for (const roleId of autoRoles) {
            try {
                if (roleId && member.roles?.add) {
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
    async sendPublicWelcome(member, conf = null) {
        const guildId = member.guild?.id;
        const cfg = conf || await this._load(guildId);
        const welcomeMsgConf = cfg.welcome_message;
        const channelId = cfg.channel_id;

        if (!welcomeMsgConf || welcomeMsgConf.enabled === false || !channelId) {
            if (!channelId) console.log(`[Welcome] sendPublicWelcome ignoré: channel_id vide pour guild ${guildId}`);
            return;
        }

        try {
            const channel = await member.guild.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                console.warn(`[Welcome] Salon public introuvable: ${channelId}`);
                return;
            }

            const replacements = {
                user: `<@${member.id}>`,
                username: member.user.username,
                server: member.guild.name,
                memberCount: member.guild.memberCount
            };

            const embed = new EmbedBuilder()
                .setColor(welcomeMsgConf.color || cfg.welcome_color || '#f2c7ce')
                .setTitle(applyReplacements(welcomeMsgConf.title, replacements) || `🎉 Bienvenue sur ${member.guild.name} !`)
                .setDescription(applyReplacements(welcomeMsgConf.description, replacements) || `Bienvenue <@${member.id}> !`)
                .setFooter({ text: applyReplacements(welcomeMsgConf.footer, replacements) || `Membre #${member.guild.memberCount}` })
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
                    if (f?.name && f?.value) {
                        embed.addFields({
                            name: applyReplacements(f.name, replacements),
                            value: applyReplacements(f.value, replacements),
                            inline: !!f.inline
                        });
                    }
                }
            }

            await channel.send({ embeds: [embed] });
            console.log(`🎉 [Welcome] Message de bienvenue public envoyé pour ${member.user.tag} dans #${channel.name}`);
        } catch (err) {
            console.error('❌ [Welcome] Erreur envoi message public:', err.message);
        }
    }

    /**
     * Envoie le message de bienvenue en message privé
     */
    async sendDmWelcome(member, conf = null) {
        const guildId = member.guild?.id;
        const cfg = conf || await this._load(guildId);
        const dmConf = cfg.dm_message;
        if (!dmConf || dmConf.enabled === false) return;

        try {
            const replacements = {
                user: `<@${member.id}>`,
                username: member.user.username,
                server: member.guild.name
            };

            const dmEmbed = new EmbedBuilder()
                .setColor(dmConf.color || '#f2c7ce')
                .setTitle(applyReplacements(dmConf.title, replacements) || '👋 Bienvenue !')
                .setDescription(applyReplacements(dmConf.description, replacements) || `Salut ${member.user.username} !`);

            if (Array.isArray(dmConf.fields)) {
                for (const f of dmConf.fields) {
                    if (f?.name && f?.value) {
                        dmEmbed.addFields({
                            name: applyReplacements(f.name, replacements),
                            value: applyReplacements(f.value, replacements),
                            inline: !!f.inline
                        });
                    }
                }
            }

            await member.send({ embeds: [dmEmbed] });
            console.log(`📩 [Welcome] DM de bienvenue envoyé à ${member.user.tag}`);
        } catch (err) {
            console.warn(`⚠️ [Welcome] Impossible d'envoyer un DM de bienvenue à ${member.user.tag}:`, err.message);
        }
    }

    /**
     * Vérifie si un palier de membres est franchi et poste un message si oui.
     * Idempotent : chaque seuil n'est annoncé qu'une fois par session de bot.
     */
    async checkMilestone(member) {
        if (!member || !member.guild) return;
        const guildId = member.guild.id;
        const cfg = await this._load(guildId);
        const ms = cfg.milestones;
        if (!ms || ms.enabled === false) return;

        const thresholds = Array.isArray(ms.thresholds) ? ms.thresholds : [];
        if (thresholds.length === 0) return;

        const channelId = ms.channel_id || cfg.channel_id;
        if (!channelId) return;

        const count = member.guild.memberCount;
        const hit = thresholds.find(t => Number(t) === count);
        if (!hit) return;

        // Anti-doublon via cache mémoire (suffisant pour l'annonce "événementielle")
        if (!this._milestoneAnnounced) this._milestoneAnnounced = new Map();
        const key = `${guildId}:${hit}`;
        if (this._milestoneAnnounced.get(key)) return;
        this._milestoneAnnounced.set(key, true);

        try {
            const channel = await member.guild.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return;

            const template = ms.template || '🎯 Le serveur passe à {count} membres !';
            const message = applyReplacements(template, { count: hit, server: member.guild.name });

            const embed = new EmbedBuilder()
                .setColor('#f2c7ce')
                .setTitle('🎯 Nouveau Palier !')
                .setDescription(message)
                .setTimestamp()
                .setFooter({ text: `Membre #${count}` });

            await channel.send({ embeds: [embed] });
            console.log(`🎯 [Welcome] Palier ${hit} annoncé dans #${channel.name}`);
        } catch (err) {
            console.error(`[Welcome] Erreur envoi palier ${hit}:`, err.message);
        }
    }

    /**
     * Envoie un message de départ dans le salon configuré.
     */
    async sendLeaveMessage(member) {
        if (!member || !member.guild) return;
        const guildId = member.guild.id;
        const cfg = await this._load(guildId);
        const lv = cfg.leave;
        if (!lv || lv.enabled === false) return;

        const channelId = lv.channel_id || cfg.channel_id;
        if (!channelId) return;

        try {
            const channel = await member.guild.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return;

            const replacements = {
                user: `<@${member.id}>`,
                username: member.user?.username || member.user?.tag || 'inconnu',
                tag: member.user?.tag || 'inconnu',
                server: member.guild.name
            };

            const message = applyReplacements(
                lv.message || ':outbox_tray: {user} a quitté le serveur.',
                replacements
            );

            const embed = new EmbedBuilder()
                .setColor(lv.color || '#ed4245')
                .setDescription(message)
                .setTimestamp()
                .setFooter({ text: `ID: ${member.id}` });

            await channel.send({ embeds: [embed] });
            console.log(`📤 [Welcome] Message de départ envoyé pour ${replacements.tag}`);
        } catch (err) {
            console.error(`[Welcome] Erreur envoi leave:`, err.message);
        }
    }

    getStatus() {
        // Statut "best-effort" : on retourne la conf globale comme no-op.
        // Le frontend lira la vraie conf par-guilde via /api/config/:guildId/welcome.
        return {
            enabled: true,
            channelId: null,
            autoRoles: [],
            sendDm: true
        };
    }

    /**
     * Compatibilité : ancien welcome.config exposait des setters.
     * On redirige vers une écriture par-guilde best-effort.
     */
    async saveConfig(guildId, patch) {
        return await saveWelcomeConfig(guildId, patch);
    }
}

Injectable()(WelcomeService.prototype);

module.exports = {
    WelcomeService
};