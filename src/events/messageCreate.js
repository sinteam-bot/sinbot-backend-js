const { logUserEvent, addMessageXP } = require('../database');
const { executeCommand } = require('../utils/commandHandler');

const path = require('path');

// ⭐ IMPORTANT : Remonter d'un niveau pour trouver .env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function addHours(date, hours) {
  const hoursToAdd = hours * 60 * 60 * 1000;
  date.setTime(date.getTime() + hoursToAdd);
  return date;
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = '1348741823237062781';

module.exports = {
    name: 'messageCreate',
    
    async execute(message) {
        // Ignorer les messages du bot lui-même
        if (message.author.bot){
            if(message.author.id == '302050872383242240'){
                if (message.embeds.length === 0) return;
                const chaineRecherchee = "Bump effectué !"
                for (const embed of message.embeds) {
                    if (embed.description && embed.description.includes(chaineRecherchee)) {

                        const guild = await message.guild;
                        //const channel = await guild.channels.fetch(CHANNEL_ID);

                        const deuxHeures = 2 * 60 * 60 * 1000;

                        setTimeout(async () => {
                            await message.channel.send(`<@&1427703047534153872> **c'est l'heure**`);
                        }, deuxHeures);
                    }
                }
            }
        }else{
            return ; 
        }
        
        
    }
};
