// commands/contra.js
const { SlashCommandBuilder } = require('discord.js');
const { getFase, getTurnoActualIndex, getVotantePorTurno, getVotanteEstado, addPuntos, setVoto } = require('../database.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contra')
    .setDescription('Emite tu voto en contra (-1 punto)')
    .addUserOption(option =>
      option.setName('candidato')
        .setDescription('El candidato que quieres hundir')
        .setRequired(true)),
  
  async execute(interaction) {
    const votanteId = interaction.user.id;
    const candidato = interaction.options.getUser('candidato');
    const canal = interaction.channel;

    // --- CADENA DE VALIDACIÓN ---

    // 1. ¿Canal correcto?
    if (interaction.channelId !== config.canalVotacion) {
      return interaction.reply({ content: `Este comando solo puede usarse en <#${config.canalVotacion}>.`, ephemeral: true });
    }

    // 2. ¿Fase correcta?
    const fase = await getFase();
    if (fase !== 'votacion') {
      return interaction.reply({ content: 'La votación principal no está activa.', ephemeral: true });
    }

    // 3. ¿Es tu turno?
    const turnoIndex = await getTurnoActualIndex();
    const votanteActual = await getVotantePorTurno(turnoIndex);

    if (votanteId !== votanteActual.user_id) {
      const reply = await interaction.reply({ content: `¡No es tu turno, <@${votanteId}>!`, fetchReply: true });
      setTimeout(() => reply.delete().catch(console.error), 60000); // 1 min
      return;
    }

    // 4. ¿Ya usaste /contra?
    const estadoVoto = await getVotanteEstado(votanteId);
    if (estadoVoto.ha_votado_contra) {
      return interaction.reply({ content: 'Ya usaste tu voto en contra. Debes usar /favor.', ephemeral: true });
    }

    // 5. ¿Admin intocable?
    if (config.adminsIntocables.includes(candidato.id)) {
      return interaction.reply({ content: '¡No puedes votar por un admin!', ephemeral: true });
    }

    // 6. ¿Es candidato?
    if (!config.candidatos.includes(candidato.id)) {
      return interaction.reply({ content: 'Esta persona no es un candidato válido.', ephemeral: true });
    }
    
    // 7. ¿Autovoto?
    if (votanteId === candidato.id) {
        return interaction.reply({ content: 'No puedes votarte a ti mismo.', ephemeral: true });
    }

    // 8. ¿Voto doble al mismo?
    if (estadoVoto.voto_favor_a === candidato.id) {
      return interaction.reply({ content: 'No puedes usar tu voto a favor y en contra en la misma persona.', ephemeral: true });
    }

    // --- ÉXITO ---
    
    // 1. Actualizar DB
    await addPuntos(candidato.id, -1); // Resta 1 punto
    await setVoto(votanteId, 'contra', candidato.id);

    // 2. Anuncio público
    await canal.send(`💀 **VOTO EN CONTRA** | <@${votanteId}> ha votado en contra de <@${candidato.id}>.`);
    
    // 3. Confirmación al votante
    await interaction.reply({ content: 'Voto en contra registrado.', ephemeral: true });
  },
};