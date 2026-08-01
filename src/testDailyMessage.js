/**
 * Script de test AUTONOME pour la génération du message du jour
 * 
 * Ce script peut être exécuté directement avec : node src/testDailyMessage.js
 * Il gère lui-même la connexion du bot Discord.
 * 
 * Configuration requise dans .env :
 *   - DISCORD_TOKEN : Token du bot Discord
 *   - OPENAI_API_KEY : Clé API OpenAI
 *   - OPENAI_MODEL : Modèle OpenAI (optionnel, défaut: gpt-4o-mini)
 */

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const path = require('path');

// ⭐ IMPORTANT : Remonter d'un niveau pour trouver .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { saveOpenAIMessage } = require('./database');
const { callResponseCustom } = require('./utils/openrouter');
const { requestPrompt, formatFinalPrompt } = require('./config/daily_message_config');

// ⬇️ ⬇️ ⬇️ CONFIGURATION ⬇️ ⬇️ ⬇️
// Modifie cette variable avec l'ID du channel Discord où tu veux envoyer le message de test
const TEST_CHANNEL_ID = '1348741823237062781'; // Channel par défaut (même que scheduledTasks.js) 

// Optionnel : Tu peux aussi surcharger l'ID du serveur si besoin
const TEST_GUILD_ID = '1337543177086959657'; // Guild par défaut
// ⬆️ ⬆️ ⬆️ CONFIGURATION ⬆️ ⬆️ ⬆️

// ============================================
// INITIALISATION DU CLIENT DISCORD
// ============================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ============================================
// FONCTION DE TEST
// ============================================

/**
 * Fonction principale de test
 */
async function runDailyMessageTest() {
    console.log('\n🧪 ========== DEBUT DU TEST AUTONOME ========== \n');

    try {
        // Vérifier que le client est prêt
        if (!client || !client.isReady()) {
            throw new Error('❌ Le client Discord n\'est pas prêt. Attends qu\'il soit connecté.');
        }

        console.log(`✅ Bot connecté en tant que: ${client.user.tag}\n`);

        console.log('🔍 Vérification du channel et du serveur...');

        // Récupérer le serveur
        let guild;
        try {
            guild = await client.guilds.fetch(TEST_GUILD_ID, false);
            console.log(`✅ Serveur trouvé: ${guild.name}`);
        } catch (error) {
            console.log(`⚠️  Serveur ${TEST_GUILD_ID} introuvable. Tentative avec le premier serveur disponible...`);
            const guilds = await client.guilds.fetch();
            guild = guilds.first();
            if (!guild) {
                throw new Error('❌ Aucun serveur Discord trouvé. Le bot n\'est peut-être dans aucun serveur.');
            }
            console.log(`✅ Utilisation du serveur: ${guild.name} (ID: ${guild.id})`);
        }

        // Récupérer le channel
        let channel;
        try {
            channel = await guild.channels.fetch(TEST_CHANNEL_ID);
            console.log(`✅ Channel trouvé: #${channel.name} (ID: ${channel.id})`);
        } catch (error) {
            console.log(`⚠️  Channel ${TEST_CHANNEL_ID} introuvable. Tentative avec le premier channel texte disponible...`);
            const textChannels = await guild.channels.fetch();
            const firstTextChannel = textChannels.find(c => c.isTextBased() && !c.isDMBased());
            if (!firstTextChannel) {
                throw new Error('❌ Aucun channel texte trouvé dans le serveur.');
            }
            channel = firstTextChannel;
            console.log(`✅ Utilisation du channel: #${channel.name} (ID: ${channel.id})`);
        }

        console.log('\n🌅 Début de la génération du message du jour...\n');

        // ============================================
        // ÉTAPE 1: Générer un prompt créatif via LLM
        // ============================================
        console.log('🔄 Étape 1/2: Génération du prompt créatif...');
        const date = new Date();

        // Options pour la génération du prompt
        const promptGenerationOptions = {
            model: process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
            temperature: 1.2,
            maxTokens: 500
        };

        console.log(`   - Modèle: ${promptGenerationOptions.model}`);
        console.log(`   - Température: ${promptGenerationOptions.temperature}`);

        const metaPrompt = requestPrompt(date);
        console.log('   - Meta-prompt envoyé à l\'IA (extraits):');
        console.log('     "' + metaPrompt.slice(0, 150) + '..."');

        const promptResponse = await callResponseCustom(metaPrompt, promptGenerationOptions);

        console.log('\n✅ Prompt généré par l\'IA:');
        console.log(`   "${promptResponse.text}"\n`);
        console.log(`   - Tokens utilisés: ${promptResponse.usage.totalTokens} (input: ${promptResponse.usage.promptTokens}, output: ${promptResponse.usage.completionTokens})`);

        // Sauvegarder la première interaction
        const promptGenerationDb = {
            msgid: promptResponse.msgId,
            prompt: metaPrompt,
            instruction: promptGenerationOptions.systemPrompt || null,
            model: promptResponse.model,
            tokeninput: promptResponse.usage.promptTokens,
            tokenoutput: promptResponse.usage.completionTokens,
            content: promptResponse.text,
            type: 'prompt_generation',
            test_mode: true
        };
        await saveOpenAIMessage(promptGenerationDb);
        console.log('   💾 Génération du prompt sauvegardée en base de données.');

        // ============================================
        // ÉTAPE 2: Générer le message final avec le prompt
        // ============================================
        console.log('\n🔄 Étape 2/2: Génération du message final...');

        // Formater le prompt final avec la date du jour
        const { prompt: finalPrompt, instruction: finalInstruction } = formatFinalPrompt(promptResponse.text, date);

        // Options pour la génération du message final
        const messageOptions = {
            model: process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
            systemPrompt: finalInstruction,
            temperature: 0.8,
            maxTokens: 300
        };

        console.log(`   - Modèle: ${messageOptions.model}`);
        console.log(`   - Température: ${messageOptions.temperature}`);
        console.log(`   - Instruction système: "${finalInstruction}"`);

        const messageResponse = await callResponseCustom(finalPrompt, messageOptions);

        console.log('\n✅ Message final généré par l\'IA:');
        console.log(`   "${messageResponse.text}"\n`);
        console.log(`   - Tokens utilisés: ${messageResponse.usage.totalTokens} (input: ${messageResponse.usage.promptTokens}, output: ${messageResponse.usage.completionTokens})`);

        // ============================================
        // ENVOYER le message sur Discord
        // ============================================
        console.log('\n📤 Envoi du message sur Discord...');

        const embed = new EmbedBuilder()
            .setColor('#F2C7CE')
            .setTitle('** ✨ Message du jour (TEST) **')
            .setDescription(messageResponse.text)
            .setTimestamp()
            .setFooter({ text: 'Mode test - Généré manuellement' });

        await channel.send({ embeds: [embed] });
        console.log(`   ✅ Message envoyé dans #${channel.name} (ID: ${channel.id})`);

        // ============================================
        // Sauvegarder le message final en base de données
        // ============================================
        const messageDb = {
            msgid: messageResponse.msgId,
            prompt: finalPrompt,
            instruction: finalInstruction,
            model: messageResponse.model,
            tokeninput: messageResponse.usage.promptTokens,
            tokenoutput: messageResponse.usage.completionTokens,
            content: messageResponse.text,
            type: 'daily_message',
            test_mode: true,
            previousMsgId: promptResponse.msgId
        };
        await saveOpenAIMessage(messageDb);
        console.log('   💾 Message final sauvegardé en base de données.');

        // ============================================
        // Résumé du test
        // ============================================
        console.log('\n📊 ========== RÉSUMÉ DU TEST ==========');
        console.log(`   Date: ${date.toLocaleString('fr-FR')}`);
        console.log(`   Bot: ${client.user.tag} (${client.user.id})`);
        console.log(`   Serveur: ${guild.name} (${guild.id})`);
        console.log(`   Channel: #${channel.name} (${channel.id})`);
        console.log(`   Total tokens: ${promptResponse.usage.totalTokens + messageResponse.usage.totalTokens}`);
        console.log(`   Modèle: ${promptResponse.model}`);
        console.log('   ✅ Test terminé avec succès !');
        console.log('   =======================================\n');

        // Fermer le client après le test (optionnel)
        // client.destroy();

    } catch (error) {
        console.error('\n❌ ERREUR lors du test:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        console.log('\n');
    }
}

// ============================================
// CONNEXION ET EXÉCUTION
// ============================================

console.log('🚀 Initialisation du bot pour le test...');
console.log('📖 Chargement de la configuration depuis .env...\n');

// Vérifier que les variables d'environnement sont présentes
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN non trouvé dans .env');
    process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY non trouvé dans .env');
    process.exit(1);
}

console.log('✅ Configuration chargée.\n');

// Événement de connexion du bot
client.on('ready', async () => {
    await runDailyMessageTest();
});

// Gestion des erreurs
client.on('error', error => {
    console.error('❌ Erreur Discord.js:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Erreur non gérée:', error);
});

// Connexion du bot
console.log('🔌 Connexion du bot Discord...\n');
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Échec de la connexion Discord:', error.message);
    process.exit(1);
});
