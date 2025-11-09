// commands/favor.js
const { SlashCommandBuilder } = require('discord.js');
const { getFase, getTurnoActualIndex, getVotantePorTurno, getVotanteEstado, addPuntos, addVotosFavorOriginales, setVoto } = require('../database.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('favor')
    .setDescription('Emite tu voto a favor (+2 puntos)')
    .addUserOption(option =>
      option.setName('candidato')
        .setDescription('El candidato que quieres apoyar')
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
      // "No es tu turno" - Mensaje público que se borra
      const reply = await interaction.reply({ content: `¡No es tu turno, <@${votanteId}>!`, fetchReply: true });
      setTimeout(() => reply.delete().catch(console.error), 60000); // 1 min
      return;
    }

    // 4. ¿Ya usaste /favor?
    const estadoVoto = await getVotanteEstado(votanteId);
    if (estadoVoto.ha_votado_favor) {
      // "Usa el voto correspondiente" - Efímero (15 seg es díficil, efímero es mejor)
      return interaction.reply({ content: 'Ya usaste tu voto a favor. Debes usar /contra.', ephemeral: true });
    }

    // 5. ¿Admin intocable? (Error Punto 3)
    if (config.adminsIntocables.includes(candidato.id)) {
      return interaction.reply({ content: '¡No puedes votar por un admin!', ephemeral: true });
    }

    // 6. ¿Es candidato? (Error Punto 1)
    if (!config.candidatos.includes(candidato.id)) {
      return interaction.reply({ content: 'Esta persona no es un candidato válido.', ephemeral: true });
    }
    
    // 7. ¿Autovoto?
    if (votanteId === candidato.id) {
        return interaction.reply({ content: 'No puedes votarte a ti mismo.', ephemeral: true });
    }

    // 8. ¿Voto doble al mismo? (Error Punto 2)
    if (estadoVoto.voto_contra_a === candidato.id) {
      return interaction.reply({ content: 'No puedes usar tu voto a favor y en contra en la misma persona.', ephemeral: true });
    }

    // --- ÉXITO ---
    
    // 1. Actualizar DB
    await addPuntos(candidato.id, 2);
    await addVotosFavorOriginales(candidato.id); // Para desempate 2.0
    await setVoto(votanteId, 'favor', candidato.id);

    // 2. Anuncio público (como pediste)
    await canal.send(`⚡ **VOTO A FAVOR** | <@${votanteId}> ha votado a favor de <@${candidato.id}>.`);
    
    // 3. Confirmación al votante
    await interaction.reply({ content: 'Voto a favor registrado.', ephemeral: true });
  },
};