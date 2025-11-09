// scheduler.js
const cron = require('node-cron');
const { 
  getTurnoActualIndex, getVotantePorTurno, getPuntuaciones, // <--- ARREGLADO
  setTurnoActualIndex, getFase, setFase,
  setCandidatosDesempate, getResultadosDesempate
} = require('./database.js');
const config = require('./config.json');

/**
 * Genera un string de la tabla de puntuaciones.
 */
async function generarTablaPuntuaciones() {
  const puntuaciones = await getPuntuaciones();
  let tabla = "📊 **RECUENTO DE VOTOS** 📊\n";
  tabla += "-----------------------------------\n";
  
  if (puntuaciones.length === 0) {
    tabla = "Aún no hay votos registrados.";
  } else {
    puntuaciones.forEach((candidato, index) => {
      // Usamos 'puntos::text' para castear a string si es necesario (buena práctica en PG)
      tabla += `**${index + 1}.** <@${candidato.user_id}>: **${candidato.puntos}** puntos\n`;
    });
  }
  return tabla;
}

/**
 * Cierra un turno, quita permisos y postea el recuento.
 */
async function cerrarTurno(client, canal) {
  const fase = await getFase();
  if (fase !== 'votacion') return;

  const turnoIndex = await getTurnoActualIndex();
  const votante = await getVotantePorTurno(turnoIndex);
  
  if (votante) {
    try {
      await canal.permissionOverwrites.edit(votante.user_id, {
        SendMessages: false
      });
      console.log(`Permisos quitados a ${votante.user_id}`);
    } catch (e) {
      console.error(`Error quitando permisos a ${votante.user_id}: ${e.message}`);
    }
  }

  const tabla = await generarTablaPuntuaciones();
  const rolTribunal = config.rolTribunal ? `<@&${config.rolTribunal}>` : '@here';
  
  await canal.send(`${rolTribunal} ¡El turno ${turnoIndex} ha terminado!`);
  await canal.send(tabla);
  console.log(`Recuento del turno ${turnoIndex} posteado.`);
}

/**
 * Inicia un nuevo turno, da permisos y anuncia.
 */
async function iniciarTurno(client, canal, nuevoTurnoIndex) {
  const fase = await getFase();
  if (fase !== 'votacion') return;
  
  if (nuevoTurnoIndex > config.votantes.length) {
    await finalizarVotacion(client, canal);
    return;
  }

  await setTurnoActualIndex(nuevoTurnoIndex);
  const votante = await getVotantePorTurno(nuevoTurnoIndex);

  if (!votante) {
    console.error(`Error: No se encontró el votante para el turno ${nuevoTurnoIndex}`);
    return;
  }

  try {
    await canal.permissionOverwrites.edit(votante.user_id, {
      SendMessages: true
    });
    await canal.permissionOverwrites.edit(config.guildId, {
      SendMessages: false,
      AddReactions: true
    });
    console.log(`Permisos dados a ${votante.user_id}`);
  } catch (e) {
    console.error(`Error dando permisos a ${votante.user_id}: ${e.message}`);
  }

  await canal.send(`--- ⏰ **NUEVO TURNO** ⏰ ---\nComienza el turno de <@${votante.user_id}>.`);
  console.log(`Turno ${nuevoTurnoIndex} iniciado para ${votante.user_id}.`);
}

/**
 * Lógica de finalización con desempate
 */
async function finalizarVotacion(client, canal) {
  console.log('Finalizando votación principal...');
  const puntuaciones = await getPuntuaciones();
  
  if (puntuaciones.length < 4) {
    await canal.send("No hay suficientes candidatos para 4 puestos. La votación ha terminado.");
    await setFase('finalizada');
    return;
  }

  const puntajeCorte = parseInt(puntuaciones[3].puntos, 10);
  
  if (puntuaciones.length > 4 && parseInt(puntuaciones[4].puntos, 10) === puntajeCorte) {
    console.log(`¡EMPATE DETECTADO! Puntaje de corte: ${puntajeCorte}`);
    
    const candidatosEmpatados = puntuaciones.filter(c =>