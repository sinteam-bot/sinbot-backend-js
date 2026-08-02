/**
 * Outil autonome de sauvegarde / dump de serveur Discord vers la BDD SQLite
 * 
 * Usage: node src/dumpDiscord.js
 */

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const {
    saveDumpUser,
    saveDumpChannel,
    saveDumpThread,
    saveDumpMessagesBatch
} = require('./database');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const GUILD_ID = process.env.GUILD_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;

/**
 * Récupérer tous les messages d'un salon ou d'un thread avec pagination (batchs de 100)
 */
async function dumpChannelMessages(targetChannel) {
    let totalMessages = 0;
    let lastId = null;
    let hasMore = true;

    while (hasMore) {
        try {
            const options = { limit: 100 };
            if (lastId) {
                options.before = lastId;
            }

            const messages = await targetChannel.messages.fetch(options);

            if (messages.size === 0) {
                hasMore = false;
                break;
            }

            const messageArray = Array.from(messages.values());

            // Sauvegarder également les auteurs des messages
            for (const msg of messageArray) {
                if (msg.author) {
                    await saveDumpUser(msg.author);
                }
            }

            // Sauvegarder le lot de messages en BDD (Transaction ultra-rapide)
            await saveDumpMessagesBatch(messageArray);

            totalMessages += messageArray.length;
            lastId = messageArray[messageArray.length - 1].id;

            process.stdout.write(`\r   └─ Messages sauvegardés dans #${targetChannel.name}: ${totalMessages}`);

            if (messages.size < 100) {
                hasMore = false;
            }
        } catch (error) {
            console.error(`\n❌ Erreur récupération messages dans #${targetChannel.name}:`, error.message);
            hasMore = false;
        }
    }

    if (totalMessages > 0) {
        console.log(''); // Retour à la ligne après completion
    } else {
        console.log(`   └─ 0 message trouvé.`);
    }

    return totalMessages;
}

/**
 * Fonction principale de Dump
 */
async function dumpServer(targetGuildId) {
    console.log('\n🚀 ========== DÉBUT DU DUMP DISCORD VER LA BDD ==========\n');
    const startTime = Date.now();

    const stats = {
        users: 0,
        channels: 0,
        threads: 0,
        messages: 0
    };

    try {
        const guild = await client.guilds.fetch(targetGuildId);
        console.log(`🏰 Serveur ciblé : ${guild.name} (ID: ${guild.id})\n`);

        // ============================================
        // 1. SAUVEGARDE DES MEMBRES & UTILISATEURS
        // ============================================
        console.log('📦 1/4 - Extraction des membres du serveur...');
        try {
            const members = await guild.members.fetch();
            for (const member of members.values()) {
                await saveDumpUser(member.user);
                stats.users++;
            }
            console.log(`✅ ${stats.users} membres sauvegardés en BDD.\n`);
        } catch (err) {
            console.error('⚠️ Impossible de récupérer tous les membres (intents ?):', err.message);
        }

        // ============================================
        // 2. SAUVEGARDE DES SALONS (CHANNELS)
        // ============================================
        console.log('📂 2/4 - Extraction des salons du serveur...');
        const channels = await guild.channels.fetch();
        const textChannels = [];

        for (const channel of channels.values()) {
            if (!channel) continue;
            await saveDumpChannel(channel);
            stats.channels++;

            if (channel.isTextBased() && !channel.isThread()) {
                textChannels.push(channel);
            }
        }
        console.log(`✅ ${stats.channels} salons enregistrés (${textChannels.length} salons textuels).\n`);

        // ============================================
        // 3. SAUVEGARDE DES THREADS (FILTS DE DISCUSSION)
        // ============================================
        console.log('🧵 3/4 - Extraction des threads...');
        const threadsToDump = [];

        try {
            /*
                // Threads actifs
                const activeThreads = await guild.channels.fetchActiveThreads();
                for (const thread of activeThreads.threads.values()) {
                    await saveDumpThread(thread);
                    threadsToDump.push(thread);
                    stats.threads++;
                }
    
                // Threads archivés par salon textuel
                for (const channel of textChannels) {
                    if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
                        try {
                            const archivedThreads = await channel.threads.fetchArchived();
                            for (const thread of archivedThreads.threads.values()) {
                                await saveDumpThread(thread);
                                threadsToDump.push(thread);
                                stats.threads++;
                            }
                        } catch (e) {
                            // Ignorer les salons sans permissions
                        }
                    }
                }
            */
            console.log(`✅ ${stats.threads} threads enregistrés.\n`);
        } catch (err) {
            console.error('⚠️ Erreur lors de la récupération des threads:', err.message);
        }
        // ============================================
        // 4. SAUVEGARDE DES MESSAGES
        // ============================================
        console.log('💬 4/4 - Extraction de l\'historique des messages...');

        // Messages dans les salons textuels
        /*
        for (const channel of textChannels) {
            console.log(`⏩ Récupération salon #${channel.name}...`);
            const msgCount = await dumpChannelMessages(channel);
            stats.messages += msgCount;
        }

        // Messages dans les threads
        if (threadsToDump.length > 0) {
            console.log('\n⏩ Récupération des messages dans les threads...');
            for (const thread of threadsToDump) {
                console.log(`🧵 Thread #${thread.name}...`);
                const msgCount = await dumpChannelMessages(thread);
                stats.messages += msgCount;
            }
        }
        */

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('\n🎉 ========== DUMP TERMINÉ AVEC SUCCÈS ! ==========');
        console.log(`⏱️  Durée totale : ${duration} secondes`);
        console.log(`📊 Résumé :`);
        console.log(`   - 👤 Utilisateurs : ${stats.users}`);
        console.log(`   - 📂 Salons       : ${stats.channels}`);
        console.log(`   - 🧵 Threads      : ${stats.threads}`);
        console.log(`   - 💬 Messages     : ${stats.messages}`);
        console.log('===================================================\n');

    } catch (error) {
        console.error('❌ Erreur lors du dump:', error);
    } finally {
        client.destroy();
        process.exit(0);
    }
}

client.once('ready', async () => {
    console.log(`🤖 Bot connecté en tant que ${client.user.tag}`);
    const targetGuildId = GUILD_ID || client.guilds.cache.first()?.id;
    if (!targetGuildId) {
        console.error('❌ Aucun GUILD_ID défini et le bot n\'est présent sur aucun serveur.');
        process.exit(1);
    }
    await dumpServer(targetGuildId);
});

if (!DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN ou BOT_TOKEN non défini dans le fichier .env.');
    process.exit(1);
}

client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Échec de la connexion du bot:', error.message);
    process.exit(1);
});

module.exports = { dumpServer };
