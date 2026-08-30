require('dotenv').config();
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('🗑️ Borrando comandos...');
    
    // Borrar globales
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log('✅ Comandos globales eliminados');
    
    // Borrar de guild
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log('✅ Comandos de guild eliminados');
    
    console.log('\n✅ Limpieza completa. Ahora ejecuta: node index.js');
  } catch (error) {
    console.error('❌ Error:', error);
  }
})();