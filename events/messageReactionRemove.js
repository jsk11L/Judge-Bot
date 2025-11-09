// events/messageReactionRemove.js
const config = require('../config.json');

module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user, client) {
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Error fetching partial reaction:', error);
        return;
      }
    }
    if (user.bot) return;

    if (reaction.message.id === config.mensajeRol && reaction.message.channel.id === config.canalRoles) {
      try {
        const role = await reaction.message.guild.roles.fetch(config.rolTribunal);
        const member = await reaction.message.guild.members.fetch(user.id);
        
        if (role && member) {
          member.roles.remove(role);
        }
      } catch (e) {
        console.error('Error al quitar rol:', e.message);
      }
    }
  },
};