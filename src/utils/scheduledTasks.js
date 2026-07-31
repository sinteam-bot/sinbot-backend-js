const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { saveOpenAIMessage, getLastOpenAIMessageId, getTodayBirthdays, getGlobalStats } = require('../database');
const { callResponseCustom } = require('./openai')
const { buildPrompt, requestPrompt } = require('../config/daily_message_config')

function setupScheduledTasks(client) {
    console.log('⏰ Configuration des tâches planifiées...');
    
    cron.schedule('0 9 * * *', async () => {
        try{
        var DailyText = buildPrompt();
        var option = {
            "model": "gpt-5-nano",
            "systemPrompt":DailyText['instruction']
            }
        
            var response = await callResponseCustom(DailyText['prompt'],option);
        const guild = client.guilds.fetch('1337543177086959657',false).then(guild =>
        {
           guild.channels.fetch('1337807772024180756')
            .then(channel=>{
                const embed = new EmbedBuilder()
                    .setColor('#F2C7CE')
                    .setTitle('** Le message du jour **')
                    .setDescription(response['text'])
                    .setTimestamp();
                channel.send({ embeds: [embed] });
            })
        }
        )
        
        var database = {
            msgid : response['msgId'],
            prompt : prompt,
            instruction : option['instructions'],
            model : response['model'],
            tokeninput : response['usage']['promptTokens'],
            tokenoutput : response['usage']['completionTokens'],
            content : response['text']
        }
        var resquery = await saveOpenAIMessage(database);
    }catch(error){
        console.error('❌ Erreur:', error.message);
    }
    }
    ,{
        timezone: "Europe/Paris"
    });

    console.log('✅ Tâches planifiées configurées');
}

module.exports = {
    setupScheduledTasks
};