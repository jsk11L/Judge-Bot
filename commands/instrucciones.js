// commands/instrucciones.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');

// El texto de las instrucciones (modifica esto como quieras)
const textoInstrucciones = `
@everyone

Bienvenidos al tribunal de **NIGGA JUDGE** donde solo los más negros podrán ser DJ.

La votación para elegir a los 4 nuevos DJ comienza **HOY**.
Las reglas son las siguientes:

**1. El Voto**
Cuando sea tu turno, tienes un tiempo límite para usar **DOS** comandos:
* \`/favor @usuario\` (Otorga **+2 Puntos**)
* \`/contra @usuario\` (Resta **-1 Punto**)

**2. El Turno**
El orden de los 18 votantes es aleatorio y secreto. Yo, **NIGGA JUDGE** te pinguearé cuando sea tu turno y te dará permiso para escribir aquí.

**3. El Horario**
Habrá dos turnos por día, con una pausa en la madrugada:
* **Turno Mañana:** 8:00 AM - 4:00 PM (16:00)
* **Turno Tarde:** 4:00 PM (16:00) - 12:00 AM (Medianoche)
* *(Excepción: El primer turno de hoy es corto, de 8 PM a 12 AM)*

Si se acaba tu tiempo, pierdes los votos que no usaste. Asi que vota negro asqueroso.

**4. El Canal**
Solo el votante activo puede escribir (chatear y votar). Los demás solo pueden usar **reacciones**. Si son admins, no escriban, para mantener la escencia.

**5. Recuento**
El bot anunciará cada voto y el recuento. Si quieres ser notificado, ve al canal <#${config.canalRoles}> y reacciona al mensaje para obtener el rol <@&${config.rolTribunal}>.

**6. Desempate**
Si hay un empate, los candidatos empatados irán a una votación final de 24 horas.

El marcador se actualizará con cada turno. Preparen sus estrategias.

**NIGGA JUDGE**
`;


module.exports = {
  data: new SlashCommandBuilder()
    .setName('instrucciones')
    .setDescription('Publica el mensaje de instrucciones de la votación.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Solo Admins
  
  async execute(interaction) {
    // Solo puede usarse en el canal de votación
    if (interaction.channelId !== config.canalVotacion) {
      return interaction.reply({ content: `Este comando solo puede usarse en <#${config.canalVotacion}>.`, ephemeral: true });
    }

    // Enviar las instrucciones
    await interaction.channel.send(textoInstrucciones);
    
    // Confirmación efímera
    await interaction.reply({ content: 'Instrucciones publicadas.', ephemeral: true });
  },
};