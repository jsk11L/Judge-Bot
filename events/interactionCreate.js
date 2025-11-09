// events/interactionCreate.js
const { InteractionType } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`Comando no encontrado: ${interaction.commandName}`);
      return;
    }

    try {
      // Intentar ejecutar el comando
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '¡Hubo un error ejecutando este comando!', ephemeral: true });
      } else {
        await interaction.reply({ content: '¡Hubo un error ejecutando este comando!', ephemeral: true });
      }
    }
  },
};