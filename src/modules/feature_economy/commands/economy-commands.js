/**
 * Slash commands économie avec sous-commandes et commandes directes
 *
 * Commandes directes :
 *   /balance [user]
 *   /daily
 *   /pay <user> <amount>
 *   /leaderboard
 *
 * Commandes avec sous-commandes :
 *   /shop list|buy
 *   /inventaire show|donner|vendre|drop|top
 *   /admin-economy money-add|money-remove|shop-create|shop-delete|item-add|item-reset
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { Command, getConfig } = require('../../../core/index.js');
const { EconomyService } = require('../services/economy.service.js');
const { ShopService } = require('../services/shop.service.js');
const { InventoryService } = require('../services/inventory.service.js');

function isAdmin(interaction) {
    return interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
}

class EconomyCommands {
    static inject = [EconomyService];

    constructor(economy) {
        this.economy = economy;
    }

    async executeBalance(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        const b = await this.economy.getOrInitBalance(interaction.guild.id, target.id);
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle(`💰 Solde de ${target.username}`)
            .addFields(
                { name: 'Portefeuille', value: `${b.balance.toLocaleString('fr-FR')} 🪙`, inline: true },
                { name: 'Banque', value: `${b.bankBalance.toLocaleString('fr-FR')} 🪙`, inline: true },
                { name: 'Total gagné', value: `${b.totalEarned.toLocaleString('fr-FR')}`, inline: true },
                { name: 'Total dépensé', value: `${b.totalSpent.toLocaleString('fr-FR')}`, inline: true }
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    async executeDaily(interaction) {
        const cfg = getConfig().features?.economy || {};
        const r = await this.economy.claimDaily(interaction.guild.id, interaction.user.id, cfg);
        if (!r.ok) {
            if (r.error === 'cooldown') {
                return interaction.reply({ content: `❌ Tu as déjà claim aujourd'hui. Réessaie <t:${Math.floor(r.nextAt / 1000)}:R>.`, ephemeral: true });
            }
            return interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Tu as reçu **${r.reward}** 🪙 ! Solde : **${r.balance}**` });
    }

    async executePay(interaction) {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (target.id === interaction.user.id) {
            return interaction.reply({ content: '❌ Tu ne peux pas te payer toi-même', ephemeral: true });
        }
        if (target.bot) {
            return interaction.reply({ content: '❌ Tu ne peux pas payer un bot', ephemeral: true });
        }
        const cfg = getConfig().features?.economy || {};
        const r = await this.economy.transfer(interaction.guild.id, interaction.user.id, target.id, amount, { taxPercent: cfg.tax_percent || 0 });
        if (!r.ok) {
            const messages = {
                insufficient_balance: '❌ Solde insuffisant',
                invalid_amount: '❌ Montant invalide',
                cannot_sell_to_self: '❌ Opération invalide'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        const taxInfo = r.tax > 0 ? ` (taxe ${r.tax} 🪙)` : '';
        return interaction.reply({ content: `✅ **${amount}** 🪙 envoyé à <@${target.id}>${taxInfo} (net: **${r.net}**)` });
    }

    async executeLeaderboard(interaction) {
        const lb = await this.economy.leaderboard(interaction.guild.id, 10);
        if (lb.length === 0) {
            return interaction.reply({ content: 'ℹ️ Aucun solde enregistré pour le moment', ephemeral: true });
        }
        const lines = lb.map((b, i) => {
            const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '👤'));
            return `${medal} **#${i + 1}** <@${b.userId}> — **${b.balance.toLocaleString('fr-FR')}** 🪙`;
        });
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🏆 Top 10 Soldes')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
}

class ShopCommands {
    static inject = [ShopService, EconomyService];

    static __commandBuilder = new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Boutique du serveur')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Voir les items en vente dans le shop')
        )
        .addSubcommand(sub =>
            sub.setName('buy')
                .setDescription('Acheter un item du shop')
                .addStringOption(o => o.setName('item').setDescription('Nom de l\'item').setRequired(true))
        );

    constructor(shop, economy) {
        this.shop = shop;
        this.economy = economy;
    }

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'list': return this.executeShopList(interaction);
            case 'buy':  return this.executeShopBuy(interaction);
            default:     return this.executeShopList(interaction);
        }
    }

    async executeShopList(interaction) {
        const list = await this.shop.list(interaction.guild.id, 25, 0);
        if (list.length === 0) {
            return interaction.reply({ content: 'ℹ️ Le shop est vide. Demande à un admin de créer des items avec `/admin-economy shop-create`.', ephemeral: true });
        }
        const lines = list.map(item => {
            const emoji = item.emoji || '🛒';
            const desc = item.description ? `\n  ${item.description}` : '';
            return `${emoji} **${item.name}** — ${item.price.toLocaleString('fr-FR')} 🪙${desc}`;
        });
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🛒 Boutique')
            .setDescription(lines.join('\n\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    async executeShopBuy(interaction) {
        const name = interaction.options.getString('item');
        const item = await this.shop.getByName(interaction.guild.id, name);
        if (!item) {
            return interaction.reply({ content: `❌ Item "${name}" introuvable. Utilise \`/shop list\`.`, ephemeral: true });
        }
        const r = await this.shop.buy(interaction.guild.id, interaction.user.id, item.id);
        if (!r.ok) {
            const messages = {
                item_not_tradeable: '❌ Cet item n\'est pas achetable',
                insufficient_balance: '❌ Solde insuffisant',
                item_not_found: '❌ Item introuvable'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Tu as acheté **${item.name}** pour **${item.price}** 🪙 !` });
    }
}

class InventoryCommands {
    static inject = [InventoryService, ShopService];

    static __commandBuilder = new SlashCommandBuilder()
        .setName('inventaire')
        .setDescription('Gestion de l\'inventaire et des objets')
        .addSubcommand(sub =>
            sub.setName('show')
                .setDescription('Voir l\'inventaire d\'un membre')
                .addUserOption(o => o.setName('user').setDescription('Cible (par défaut toi-même)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('donner')
                .setDescription('Donner un item à un autre membre')
                .addUserOption(o => o.setName('user').setDescription('Destinataire').setRequired(true))
                .addStringOption(o => o.setName('item').setDescription('Nom de l\'item').setRequired(true))
                .addIntegerOption(o => o.setName('quantity').setDescription('Quantité (défaut 1)').setRequired(false).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('vendre')
                .setDescription('Vendre un item à un autre membre pour un prix donné')
                .addUserOption(o => o.setName('user').setDescription('Acheteur').setRequired(true))
                .addStringOption(o => o.setName('item').setDescription('Nom de l\'item').setRequired(true))
                .addIntegerOption(o => o.setName('price').setDescription('Prix de vente').setRequired(true).setMinValue(1))
                .addIntegerOption(o => o.setName('quantity').setDescription('Quantité (défaut 1)').setRequired(false).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('drop')
                .setDescription('Lancer un drop d\'item à récupérer')
                .addStringOption(o => o.setName('item').setDescription('Nom de l\'item').setRequired(true))
                .addIntegerOption(o => o.setName('duration').setDescription('Durée en minutes (1-10)').setRequired(false).setMinValue(1).setMaxValue(10))
                .addIntegerOption(o => o.setName('quantity').setDescription('Quantité (défaut 1)').setRequired(false).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('top')
                .setDescription('Voir les items les plus possédés')
        );

    constructor(inventory, shop) {
        this.inventory = inventory;
        this.shop = shop;
    }

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'show':   return this.executeInventaire(interaction);
            case 'donner': return this.executeObjetDonner(interaction);
            case 'vendre': return this.executeObjetVendre(interaction);
            case 'drop':   return this.executeDropobjet(interaction);
            case 'top':    return this.executeTopitems(interaction);
            default:       return this.executeInventaire(interaction);
        }
    }

    async executeInventaire(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        const inv = await this.inventory.listInventory(interaction.guild.id, target.id);
        if (inv.length === 0) {
            return interaction.reply({ content: `ℹ️ <@${target.id}> n'a aucun item.`, ephemeral: true });
        }
        const lines = inv.slice(0, 20).map(e => {
            const emoji = e.itemEmoji || '📦';
            const name = e.itemName || e.itemId.slice(0, 8);
            return `${emoji} **${name}** ×${e.quantity}`;
        });
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎒 Inventaire de ${target.username}`)
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    async executeObjetDonner(interaction) {
        const target = interaction.options.getUser('user');
        const itemName = interaction.options.getString('item');
        const qty = interaction.options.getInteger('quantity') || 1;
        const item = await this.shop.getByName(interaction.guild.id, itemName);
        if (!item) return interaction.reply({ content: `❌ Item "${itemName}" introuvable.`, ephemeral: true });
        const r = await this.inventory.give({ guildId: interaction.guild.id, fromUserId: interaction.user.id, toUserId: target.id, itemId: item.id, quantity: qty });
        if (!r.ok) {
            const messages = {
                sender_does_not_own: '❌ Tu ne possèdes pas cet item',
                insufficient_quantity: '❌ Quantité insuffisante',
                item_not_tradeable: '❌ Item non échangeable'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ **${qty}x ${item.name}** envoyé à <@${target.id}>` });
    }

    async executeObjetVendre(interaction) {
        const target = interaction.options.getUser('user');
        const itemName = interaction.options.getString('item');
        const price = interaction.options.getInteger('price');
        const qty = interaction.options.getInteger('quantity') || 1;
        const item = await this.shop.getByName(interaction.guild.id, itemName);
        if (!item) return interaction.reply({ content: `❌ Item "${itemName}" introuvable.`, ephemeral: true });
        const r = await this.inventory.sell({ guildId: interaction.guild.id, sellerId: interaction.user.id, buyerId: target.id, itemId: item.id, quantity: qty, price });
        if (!r.ok) {
            return interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Tu as vendu **${qty}x ${item.name}** à <@${target.id}> pour **${price}** 🪙` });
    }

    async executeDropobjet(interaction) {
        const itemName = interaction.options.getString('item');
        const duration = interaction.options.getInteger('duration') || 2;
        const qty = interaction.options.getInteger('quantity') || 1;
        const item = await this.shop.getByName(interaction.guild.id, itemName);
        if (!item) return interaction.reply({ content: `❌ Item "${itemName}" introuvable.`, ephemeral: true });
        if (!item.isDroppable) return interaction.reply({ content: '❌ Cet item ne peut pas être droppé', ephemeral: true });

        const cfg = getConfig().features?.economy || {};
        const maxMin = cfg.drops?.max_duration_min || 10;
        if (duration > maxMin) return interaction.reply({ content: `❌ Durée max ${maxMin} min`, ephemeral: true });

        const drop = await this.inventory.startDrop({ guildId: interaction.guild.id, channelId: interaction.channel.id, itemId: item.id, quantity: qty, durationMinutes: duration });
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🎁 Drop !')
            .setDescription(`**${item.emoji || '🎁'} ${qty}x ${item.name}**\n\nCliquez sur **Récupérer !** dans les ${duration} minutes !`)
            .setFooter({ text: `Lancé par ${interaction.user.tag}` })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`drop:claim:${drop.id}`)
                .setLabel('Récupérer !')
                .setEmoji('🎉')
                .setStyle(ButtonStyle.Success)
        );
        const sent = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        await this.inventory.setDropMessageId(drop.id, sent.id);
        return { id: drop.id };
    }

    async executeTopitems(interaction) {
        const items = await this.shop.list(interaction.guild.id, 100, 0);
        if (items.length === 0) return interaction.reply({ content: 'ℹ️ Aucun item', ephemeral: true });
        const lines = [];
        for (const item of items.slice(0, 10)) {
            const holders = await this.inventory.listHolders(interaction.guild.id, item.id);
            const total = holders.reduce((s, h) => s + h.quantity, 0);
            const emoji = item.emoji || '📦';
            lines.push(`${emoji} **${item.name}** — ${total} possédé(s) par ${holders.length} membre(s)`);
        }
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('📊 Top items')
            .setDescription(lines.join('\n'))
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
}

class DropButtonHandler {
    static inject = [InventoryService, ShopService];

    constructor(inventory, shop) {
        this.inventory = inventory;
        this.shop = shop;
    }

    async execute(interaction) {
        const id = interaction.customId.split(':')[2];
        const r = await this.inventory.claimDrop(id, interaction.user.id);
        if (!r.ok) {
            const messages = {
                drop_not_found: '❌ Drop introuvable',
                drop_not_active: '❌ Drop expiré',
                drop_expired: '❌ Drop expiré',
                drop_already_claimed: '❌ Déjà réclamé par quelqu\'un d\'autre'
            };
            return interaction.reply({ content: messages[r.error] || `❌ ${r.error}`, ephemeral: true });
        }
        const item = await this.shop.get(r.data.itemId);
        return interaction.reply({ content: `✅ Vous avez récupéré **${r.data.quantity}x ${item?.name || 'item'}** !` });
    }
}

class AdminEconomyCommands {
    static inject = [EconomyService, ShopService, InventoryService];

    static __commandBuilder = new SlashCommandBuilder()
        .setName('admin-economy')
        .setDescription('Administration de l\'économie, du shop et des inventaires')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('money-add')
                .setDescription('Ajouter de la monnaie à un membre')
                .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
                .addIntegerOption(o => o.setName('amount').setDescription('Montant').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('money-remove')
                .setDescription('Retirer de la monnaie à un membre')
                .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
                .addIntegerOption(o => o.setName('amount').setDescription('Montant').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('shop-create')
                .setDescription('Créer un item de shop')
                .addStringOption(o => o.setName('name').setDescription('Nom de l\'item').setRequired(true).setMaxLength(50))
                .addIntegerOption(o => o.setName('price').setDescription('Prix').setRequired(true).setMinValue(0))
                .addStringOption(o => o.setName('description').setDescription('Description').setRequired(false).setMaxLength(200))
                .addRoleOption(o => o.setName('role').setDescription('Rôle cadeau (optionnel)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('shop-delete')
                .setDescription('Supprimer un item de shop')
                .addStringOption(o => o.setName('name').setDescription('Nom de l\'item').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('item-add')
                .setDescription('Ajouter un item à l\'inventaire d\'un membre')
                .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
                .addStringOption(o => o.setName('item').setDescription('Nom de l\'item').setRequired(true))
                .addIntegerOption(o => o.setName('quantity').setDescription('Quantité (défaut 1)').setRequired(false).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('item-reset')
                .setDescription('Vider l\'inventaire d\'un membre')
                .addUserOption(o => o.setName('user').setDescription('Cible').setRequired(true))
        );

    constructor(economy, shop, inventory) {
        this.economy = economy;
        this.shop = shop;
        this.inventory = inventory;
    }

    async execute(interaction) {
        if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin uniquement', ephemeral: true });
        const sub = interaction.options.getSubcommand();
        switch (sub) {
            case 'money-add':    return this.executeAddMoney(interaction);
            case 'money-remove': return this.executeRemoveMoney(interaction);
            case 'shop-create':  return this.executeCreateShop(interaction);
            case 'shop-delete':  return this.executeDeleteShop(interaction);
            case 'item-add':     return this.executeAddItem(interaction);
            case 'item-reset':   return this.executeResetItem(interaction);
            default:             return interaction.reply({ content: '❌ Sous-commande inconnue', ephemeral: true });
        }
    }

    async executeAddMoney(interaction) {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const r = await this.economy.add(interaction.guild.id, target.id, amount, { type: 'admin', reason: 'admin_grant' });
        if (!r.ok) return interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
        return interaction.reply({ content: `✅ **${amount}** 🪙 ajoutés à <@${target.id}>` });
    }

    async executeRemoveMoney(interaction) {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const r = await this.economy.remove(interaction.guild.id, target.id, amount, { type: 'admin' });
        if (!r.ok) return interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
        return interaction.reply({ content: `✅ **${amount}** 🪙 retirés à <@${target.id}>` });
    }

    async executeCreateShop(interaction) {
        const name = interaction.options.getString('name');
        const price = interaction.options.getInteger('price');
        const description = interaction.options.getString('description');
        const role = interaction.options.getRole('role');
        const r = await this.shop.create({ guildId: interaction.guild.id, name, price, description, roleRewardId: role?.id, emoji: '🛒' });
        if (!r.ok) return interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
        return interaction.reply({ content: `✅ Item **${name}** créé pour **${price}** 🪙` });
    }

    async executeDeleteShop(interaction) {
        const name = interaction.options.getString('name');
        const item = await this.shop.getByName(interaction.guild.id, name);
        if (!item) return interaction.reply({ content: `❌ Item "${name}" introuvable`, ephemeral: true });
        await this.shop.delete(item.id);
        return interaction.reply({ content: `✅ Item **${name}** supprimé` });
    }

    async executeAddItem(interaction) {
        const target = interaction.options.getUser('user');
        const itemName = interaction.options.getString('item');
        const qty = interaction.options.getInteger('quantity') || 1;
        const item = await this.shop.getByName(interaction.guild.id, itemName);
        if (!item) return interaction.reply({ content: `❌ Item "${itemName}" introuvable`, ephemeral: true });
        const { db } = require('../../../db/index.js');
        await db.pool.query(
            `INSERT INTO user_inventory (user_id, guild_id, item_id, quantity, acquired_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, guild_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + $4`,
            [target.id, interaction.guild.id, item.id, qty, Date.now()]
        );
        return interaction.reply({ content: `✅ **${qty}x ${item.name}** ajoutés à <@${target.id}>` });
    }

    async executeResetItem(interaction) {
        const target = interaction.options.getUser('user');
        const { db } = require('../../../db/index.js');
        await db.pool.query(`DELETE FROM user_inventory WHERE guild_id = $1 AND user_id = $2`, [interaction.guild.id, target.id]);
        return interaction.reply({ content: `✅ Inventaire de <@${target.id}> réinitialisé` });
    }
}

// =================== DIRECT BUILDERS ===================

const balanceBuilder = new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Afficher le solde d\'un membre')
    .addUserOption(o => o.setName('user').setDescription('Cible (par défaut toi-même)').setRequired(false));

const dailyBuilder = new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim ta récompense quotidienne');

const payBuilder = new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Envoyer de la monnaie à un autre membre')
    .addUserOption(o => o.setName('user').setDescription('Destinataire').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Montant').setRequired(true).setMinValue(1));

const leaderboardBuilder = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top 10 des plus riches');

// =================== REGISTER ===================

Command({ name: 'balance', builder: balanceBuilder })(EconomyCommands.prototype, 'executeBalance');
Command({ name: 'daily', builder: dailyBuilder })(EconomyCommands.prototype, 'executeDaily');
Command({ name: 'pay', builder: payBuilder })(EconomyCommands.prototype, 'executePay');
Command({ name: 'leaderboard', builder: leaderboardBuilder })(EconomyCommands.prototype, 'executeLeaderboard');

Command({ name: 'shop', builder: ShopCommands.__commandBuilder })(ShopCommands.prototype, 'execute');
Command({ name: 'inventaire', builder: InventoryCommands.__commandBuilder })(InventoryCommands.prototype, 'execute');
Command({ name: 'admin-economy', builder: AdminEconomyCommands.__commandBuilder })(AdminEconomyCommands.prototype, 'execute');
Command({ name: 'drop-claim-button' })(DropButtonHandler.prototype, 'execute');

module.exports = {
    EconomyCommands, ShopCommands, InventoryCommands, DropButtonHandler,
    AdminEconomyCommands
};
