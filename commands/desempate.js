// commands/desempate.js
const { SlashCommandBuilder } = require('discord.js');
const { getFase, getCandidatosDesempate, haVotadoDesempate, addVotoDesempate } = require('../database.js'); // (Añadiremos estas funciones)
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('desempate')
    .setDescription('Emite tu voto de Muerte Súbita (+1 punto)')
    .addUserOption(option =>
      option.setName('candidato')
        .setDescription('El candidato empatado que quieres que gane')
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
    if (fase !== 'desempate') {
      return interaction.reply({ content: 'La Muerte Súbita no está activa.', ephemeral: true });
    }

    // 3. ¿Eres un votante válido? (Revisamos la lista original)
    if (!config.votantes.includes(votanteId)) {
        return interaction.reply({ content: 'No eres parte de los 18 votantes originales.', ephemeral: true });
    }

    // 4. ¿Ya votaste?
    const yaVoto = await haVotadoDesempate(votanteId);
    if (yaVoto) {
      return interaction.reply({ content: 'Ya has emitido tu voto en este desempate.', ephemeral: true });
    }

    // 5. ¿Es un candidato del desempate?
    const candidatosEmpatados = await getCandidatosDesempate();
    if (!candidatosEmpatados.includes(candidato.id)) {
      return interaction.reply({ content: `Esta persona (<@${candidato.id}>) no es un candidato válido en este desempate.`, ephemeral: true });
    }

    // --- ÉXITO ---
    
    // 1. Actualizar DB
    await addVotoDesempate(votanteId, candidato.id);

    // 2. Anuncio público (como pediste)
    await canal.send(`🔥 **VOTO DE DESEMPATE** | <@${votanteId}> ha votado por <@${candidato.id}>.`);
    
    // 3. Confirmación al votante
    await interaction.reply({ content: 'Voto de desempate registrado.', ephemeral: true });
  },
};