// index.js
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();

// 1. Importa el módulo HTTP
const http = require('http');

// 2. Crea un servidor básico
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot está despierto y funcionando.\n');
});

// 3. Haz que el servidor escuche. Render te da el puerto en una variable de entorno.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor HTTP escuchando en el puerto ${PORT}`);
});

// Creamos el Cliente de Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, // Necesario para los roles por reacción
  ],
});

// --- Carga de Comandos ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
// (Crearemos esta carpeta 'commands' en el siguiente paso)
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[AVISO] Al comando en ${filePath} le falta "data" o "execute".`);
    }
  }
} else {
  console.warn("[AVISO] No se encontró la carpeta /commands. Creándola.");
  fs.mkdirSync(commandsPath);
}


// --- Carga de Eventos ---
const eventsPath = path.join(__dirname, 'events');
// (Crearemos esta carpeta 'events' en el siguiente paso)
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
} else {
    console.warn("[AVISO] No se encontró la carpeta /events. Creándola.");
    fs.mkdirSync(eventsPath);
}

// Iniciar sesión en Discord
client.login(process.env.DISCORD_TOKEN);