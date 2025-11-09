// deploy-commands.js
const { REST, Routes } = require('discord.js');
const config = require('./config.json');
require('dotenv').config(); // Carga el .env

const commands = [
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
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registrando comandos slash (/) ...');

    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId), // Necesitarás añadir 'clientId' de tu bot al config.json
      { body: commands },
    );

    console.log('¡Comandos registrados exitosamente!');
  } catch (error) {
    console.error(error);
  }
})();