/**
 * /anniversaire (set|list|enable|disable|retirer|config)
 * Compatible Slash Commands & Commandes Textuelles avec préfixe (!)
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Command } = require('../../../core/index.js');
const { BirthdayService } = require('../services/birthday.service.js');

function getContext(ctx, args = []) {
    const isInteraction = !!ctx.isChatInputCommand || !!ctx.options;
    const user = ctx.user || ctx.author;
    const guild = ctx.guild;
    const member = ctx.member;
    const isAdmin = member?.permissions?.has?.(PermissionFlagsBits.Administrator) || false;

    const reply = async (options) => {
        if (typeof options === 'string') {
            options = { content: options };
        }
        if (isInteraction) {
            if (ctx.deferred || ctx.replied) {
                return ctx.followUp(options);
            }
            return ctx.reply(options);
        }
        return ctx.reply(options);
    };

    const getString = (name, index = 0) => {
        if (isInteraction && ctx.options?.getString) {
            return ctx.options.getString(name);
        }
        return args[index] || null;
    };

    const getSubcommand = () => {
        if (isInteraction && ctx.options?.getSubcommand) {
            try {
                return ctx.options.getSubcommand(false);
            } catch {
                return null;
            }
        }
        return args[0] ? args[0].toLowerCase() : null;
    };

    return { isInteraction, user, guild, member, isAdmin, reply, getString, getSubcommand };
}

class BirthdayCommands {
    static inject = [BirthdayService];

    constructor(birthday) {
        this.birthday = birthday;
    }

    /**
     * Commande principale /anniversaire ou !anniversaire <subcommand>
     */
    async executeMain(ctx, args = []) {
        const { getSubcommand } = getContext(ctx, args);
        const sub = getSubcommand();
        const subArgs = args.slice(1);

        switch (sub) {
            case 'set':
                return this.executeSet(ctx, subArgs);
            case 'list':
                return this.executeList(ctx, subArgs);
            case 'enable':
                return this.executeEnable(ctx, subArgs);
            case 'disable':
                return this.executeDisable(ctx, subArgs);
            case 'retirer':
            case 'remove':
            case 'delete':
                return this.executeRetirer(ctx, subArgs);
            case 'config':
                return this.executeConfig(ctx, subArgs);
            default:
                return this.executeList(ctx, subArgs);
        }
    }

    async executeSet(ctx, args = []) {
        const { user, guild, reply, getString } = getContext(ctx, args);
        const date = getString('date', 0);

        if (!date) {
            return reply({ content: '❌ Date manquante. Utilise `/anniversaire set date:JJ/MM` ou `!anniversaire-set JJ/MM` (ex: `01/09` ou `2000-09-01`).', ephemeral: true });
        }

        const r = await this.birthday.setBirthday({
            userId: user.id,
            username: user.username,
            guildId: guild?.id,
            birthdate: date
        });

        if (!r.ok) {
            if (r.error === 'cooldown') {
                const days = Math.ceil((r.nextChangeAt - Date.now()) / 86400_000);
                return reply({ content: `❌ Tu dois attendre encore ~${days} jour(s) avant de pouvoir modifier ton anniversaire.`, ephemeral: true });
            }
            const messages = {
                empty: '❌ Date vide',
                invalid_format: '❌ Format invalide. Utilise JJ/MM, JJ/MM/AAAA ou YYYY-MM-DD (ex: `01/09` ou `2000-09-01`)',
                invalid_date: '❌ Date invalide (jour/mois)',
                missing_params: '❌ Paramètres manquants'
            };
            return reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }

        return reply({ content: `✅ Anniversaire enregistré : **${r.birthdate}** (visible sur ce serveur)`, ephemeral: true });
    }

    async executeList(ctx, args = []) {
        const { guild, reply } = getContext(ctx, args);
        const guildId = guild?.id;
        const list = await this.birthday.listUpcoming(guildId, 365);

        if (!list || list.length === 0) {
            return reply({ content: 'ℹ️ Aucun anniversaire à venir sur ce serveur. Renseigne le tien avec `/anniversaire set date:JJ/MM` !', ephemeral: true });
        }

        const top10 = list.slice(0, 10);
        const lines = top10.map(b => {
            const ageLabel = (b.age && b.age > 0) ? `(${b.age} ans)` : '';
            const prefix = b.days_until === 0 ? "🎂 **Aujourd'hui**" : `🗓️ **J-${b.days_until}** (${b.dateFormatted})`;
            return `${prefix} — <@${b.userId}> ${ageLabel}`.trim();
        });

        const embed = new EmbedBuilder()
            .setColor(0xf2c7ce)
            .setTitle('🎂 Prochains anniversaires du serveur')
            .setDescription(lines.join('\n'))
            .setFooter({ text: `${list.length} anniversaire(s) enregistré(s)` })
            .setTimestamp();

        return reply({ embeds: [embed] });
    }

    async executeEnable(ctx, args = []) {
        const { user, guild, reply } = getContext(ctx, args);
        if (!guild?.id) return reply({ content: '❌ Commande utilisable uniquement sur un serveur.', ephemeral: true });
        await this.birthday.setVisibility(user.id, guild.id, true);
        return reply({ content: '✅ Ton anniversaire est désormais visible sur ce serveur.', ephemeral: true });
    }

    async executeDisable(ctx, args = []) {
        const { user, guild, reply } = getContext(ctx, args);
        if (!guild?.id) return reply({ content: '❌ Commande utilisable uniquement sur un serveur.', ephemeral: true });
        await this.birthday.setVisibility(user.id, guild.id, false);
        return reply({ content: '✅ Ton anniversaire est désormais masqué sur ce serveur.', ephemeral: true });
    }

    async executeRetirer(ctx, args = []) {
        const { user, reply } = getContext(ctx, args);
        await this.birthday.removeBirthday(user.id, null);
        return reply({ content: '✅ Ton anniversaire a été retiré de la base de données.', ephemeral: true });
    }

    async executeConfig(ctx, args = []) {
        const { guild, isAdmin, reply, getString } = getContext(ctx, args);
        if (!isAdmin) {
            return reply({ content: '❌ Cette commande est réservée aux administrateurs.', ephemeral: true });
        }
        if (!guild?.id) {
            return reply({ content: '❌ Commande utilisable uniquement sur un serveur.', ephemeral: true });
        }

        const field = getString('field', 0);
        const value = getString('value', 1);

        const validFields = ['mode', 'announce_channel_id', 'announce_hour', 'announce_timezone', 'ping_role_id', 'message_template', 'temp_role_id', 'enabled'];
        if (!field || !validFields.includes(field)) {
            return reply({ content: `❌ Champ invalide. Champs disponibles : \`${validFields.join('`, `')}\``, ephemeral: true });
        }
        if (value === null || value === undefined) {
            return reply({ content: '❌ Valeur manquante.', ephemeral: true });
        }

        let parsed = value;
        if (field === 'enabled') parsed = value === 'true' || value === '1';
        if (field === 'announce_hour') parsed = parseInt(value, 10);

        await this.birthday.updateSettings(guild.id, { [field]: parsed });
        return reply({ content: `✅ Configuration mise à jour : **${field}** = \`${value}\``, ephemeral: true });
    }
}

// Slash Command globale /anniversaire avec sous-commandes
const mainBuilder = new SlashCommandBuilder()
    .setName('anniversaire')
    .setDescription('Gestion des anniversaires')
    .addSubcommand(sub =>
        sub.setName('set')
            .setDescription('Définir ta date d\'anniversaire')
            .addStringOption(o => o.setName('date').setDescription('Date (JJ/MM, JJ/MM/AAAA ou YYYY-MM-DD)').setRequired(true).setMaxLength(10))
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Lister les prochains anniversaires du serveur')
    )
    .addSubcommand(sub =>
        sub.setName('enable')
            .setDescription('Afficher ton anniversaire sur ce serveur')
    )
    .addSubcommand(sub =>
        sub.setName('disable')
            .setDescription('Masquer ton anniversaire sur ce serveur')
    )
    .addSubcommand(sub =>
        sub.setName('retirer')
            .setDescription('Supprimer ton anniversaire de la base de données')
    )
    .addSubcommand(sub =>
        sub.setName('config')
            .setDescription('Modifier la configuration des anniversaires (Admin)')
            .addStringOption(o => o.setName('field').setDescription('Paramètre à modifier').setRequired(true))
            .addStringOption(o => o.setName('value').setDescription('Nouvelle valeur').setRequired(true))
    );

// Standalone Slash Commands (rétrocompatibilité)
const setBuilder = new SlashCommandBuilder()
    .setName('anniversaire-set')
    .setDescription('Définir ta date d\'anniversaire')
    .addStringOption(o => o.setName('date').setDescription('Date (JJ/MM ou YYYY-MM-DD)').setRequired(true).setMaxLength(10));

const listBuilder = new SlashCommandBuilder()
    .setName('anniversaire-list')
    .setDescription('Lister les prochains anniversaires du serveur');

const enableBuilder = new SlashCommandBuilder()
    .setName('anniversaire-enable')
    .setDescription('Afficher ton anniversaire sur ce serveur');

const disableBuilder = new SlashCommandBuilder()
    .setName('anniversaire-disable')
    .setDescription('Masquer ton anniversaire sur ce serveur');

const retirerBuilder = new SlashCommandBuilder()
    .setName('anniversaire-retirer')
    .setDescription('Supprimer ton anniversaire de la base de données');

const configBuilder = new SlashCommandBuilder()
    .setName('anniversaire-config')
    .setDescription('Modifier la configuration (admin)')
    .addStringOption(o => o.setName('field').setDescription('Champ (mode, announce_channel_id, ...)').setRequired(true))
    .addStringOption(o => o.setName('value').setDescription('Valeur').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

Command({ name: 'anniversaire', builder: mainBuilder })(BirthdayCommands.prototype, 'executeMain');
Command({ name: 'anniversaire-set', builder: setBuilder })(BirthdayCommands.prototype, 'executeSet');
Command({ name: 'anniversaire-list', builder: listBuilder })(BirthdayCommands.prototype, 'executeList');
Command({ name: 'anniversaire-enable', builder: enableBuilder })(BirthdayCommands.prototype, 'executeEnable');
Command({ name: 'anniversaire-disable', builder: disableBuilder })(BirthdayCommands.prototype, 'executeDisable');
Command({ name: 'anniversaire-retirer', builder: retirerBuilder })(BirthdayCommands.prototype, 'executeRetirer');
Command({ name: 'anniversaire-config', builder: configBuilder })(BirthdayCommands.prototype, 'executeConfig');

module.exports = { BirthdayCommands };
