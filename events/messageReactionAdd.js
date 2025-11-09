// events/messageReactionAdd.js
const config = require('../config.json');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    // Si la reacción es parcial, la "fetch" (cargamos)
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Error fetching partial reaction:', error);
        return;
      }
    }

    // Ignorar al bot
    if (user.bot) return;

    // Verificar si es el mensaje y canal correctos
    if (reaction.message.id === config.mensajeRol && reaction.message.channel.id === config.canalRoles) {
      try {
        const role = await reaction.message.guild.roles.fetch(config.rolTribunal);
        const member = await reaction.message.guild.members.fetch(user.id);
        
        if (role && member) {
          member.roles.add(role);
        }
      } catch (e) {
        console.error('Error al añadir rol:', e.message);
      }
    }
  },
};