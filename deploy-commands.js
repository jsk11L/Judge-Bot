// deploy-commands.js
const { REST, Routes, PermissionFlagsBits } = require('discord.js');
const config = require('./config.json');
require('dotenv').config(); // Carga el .env

const commands = [
  // Comando /favor
  {
    name: 'favor',
    description: 'Emite tu voto a favor (+2 puntos)',
    options: [
      {
        name: 'candidato',
        type: 6, // 6 = USER
        description: 'El candidato que quieres apoyar',
        required: true,
      },
    ],
  },
  // Comando /contra
  {
    name: 'contra',
    description: 'Emite tu voto en contra (-1 punto)',
    options: [
      {
        name: 'candidato',
        type: 6, // 6 = USER
        description: 'El candidato que quieres hundir',
        required: true,
      },
    ],
  },
  // Comando /desempate
  {
    name: 'desempate',
    description: 'Emite tu voto en la Muerte Súbita (+1 punto)',
    options: [
      {
        name: 'candidato',
        type: 6, // 6 = USER
        description: 'El candidato empatado que quieres que gane',
        required: true,
      },
    ],
  },
  // COMANDO /instrucciones (¡Este faltaba!)
  {
    name: 'instrucciones',
    description: 'Publica el mensaje de instrucciones de la votación.',
    default_member_permissions: String(PermissionFlagsBits.Administrator) // Solo Admins
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registrando ${commands.length} comandos slash (/) ...`);

    // Asegúrate de tener 'clientId' en tu config.json
    if (!config.clientId) {
        throw new Error('Error: Falta "clientId" en config.json');
    }
    
    // Asegúrate de tener 'guildId' en tu config.json
    if (!config.guildId) {
        throw new Error('Error: Falta "guildId" en config.json');
    }

    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );

    console.log(`¡${data.length} comandos registrados exitosamente!`);
  } catch (error) {
    console.error(error);
  }
})();