// scheduler.js
const cron = require('node-cron');
// ¡Importamos todas las funciones de la DB, incluidas las nuevas!
const { 
  getTurnoActualIndex, getVotantePorTurno, getPuntuaciones, 
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
    // ¡Se acabaron los 18 votantes!
    await finalizarVotacion(client, canal); // Llamamos a la lógica de finalización
    return;
  }

  await setTurnoActualIndex(nuevoTurnoIndex);
  const votante = await getVotantePorTurno(nuevoTurnoIndex);

  if (!votante) {
    console.error(`Error: No se encontró el votante para el turno ${nuevoTurnoIndex}`);
    return;
  }

  try {
    // Dar permisos
    await canal.permissionOverwrites.edit(votante.user_id, {
      SendMessages: true
    });
    // Quitar permisos a @everyone
    await canal.permissionOverwrites.edit(config.guildId, {
      SendMessages: false,
      AddReactions: true
    });
    console.log(`Permisos dados a ${votante.user_id}`);
  } catch (e) {
    console.error(`Error dando permisos a ${votante.user_id}: ${e.message}`);
  }

  // Anunciar
  await canal.send(`--- ⏰ **NUEVO TURNO** ⏰ ---\nComienza el turno de <@${votante.user_id}>.`);
  console.log(`Turno ${nuevoTurnoIndex} iniciado para ${votante.user_id}.`);
}

/**
 * ¡NUEVA! Lógica de finalización con desempate
 */
async function finalizarVotacion(client, canal) {
  console.log('Finalizando votación principal...');
  const puntuaciones = await getPuntuaciones();
  
  // Caso 1: No hay suficientes candidatos (menos de 4)
  if (puntuaciones.length < 4) {
    await canal.send("No hay suficientes candidatos para 4 puestos. La votación ha terminado.");
    await setFase('finalizada');
    return;
  }

  const puntajeCorte = puntuaciones[3].puntos; // Puntos del 4to lugar
  
  // Caso 2: Revisar si hay empate en el 4to lugar
  // (Si el 4to y 5to tienen los mismos puntos)
  if (puntuaciones.length > 4 && puntuaciones[4].puntos === puntajeCorte) {
    console.log(`¡EMPATE DETECTADO! Puntaje de corte: ${puntajeCorte}`);
    
    const candidatosEmpatados = puntuaciones.filter(c => c.puntos === puntajeCorte).map(c => c.user_id);
    await setCandidatosDesempate(candidatosEmpatados);
    await setFase('desempate'); // Cambiamos la fase

    let anuncio = "🛑 **¡HAY UN EMPATE EN EL 4to LUGAR!** 🛑\n\n";
    anuncio += "Los siguientes candidatos se enfrentarán en una **MUERTE SÚBITA** de 24 horas:\n";
    candidatosEmpatados.forEach(id => {
      anuncio += `  - <@${id}>\n`;
    });
    anuncio += `\nLos 18 votantes originales ahora pueden usar \`/desempate @candidato\` para decidir el ganador.`;
    
    // Abrimos el canal para todos los votantes
    try {
        for (const votanteId of config.votantes) {
            await canal.permissionOverwrites.edit(votanteId, { SendMessages: true });
        }
        await canal.permissionOverwrites.edit(config.guildId, { SendMessages: false, AddReactions: true });
        console.log('Permisos de Muerte Súbita establecidos.');
    } catch (e) {
        console.error('Error al dar permisos de Muerte Súbita:', e.message);
    }
    
    await canal.send(anuncio);

    // Programar el fin del desempate para 24 horas después
    const finDesempate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [min, hora, dia, mes] = [finDesempate.getMinutes(), finDesempate.getHours(), finDesempate.getDate(), finDesempate.getMonth() + 1];

    console.log(`Programando final de desempate para: ${dia}/${mes} ${hora}:${min}`);
    
    cron.schedule(`${min} ${hora} ${dia} ${mes} *`, async () => {
      await finalizarDesempate(client, canal);
    }, { timezone: "America/Santiago", scheduled: true }); // ¡MISMA ZONA HORARIA!

  } else {
    // Caso 3: No hay empate.
    console.log('No hay empate. Anunciando ganadores.');
    await setFase('finalizada');
    await canal.send("🛑 **¡LA VOTACIÓN HA TERMINADO!** 🛑");

    const ganadores = puntuaciones.slice(0, 4); // Los primeros 4
    let anuncio = "Los 4 nuevos administradores son:\n";
    ganadores.forEach((g, i) => {
      anuncio += `**${i+1}.** <@${g.user_id}> con **${g.puntos}** puntos\n`;
    });
    await canal.send(anuncio);
  }
}

/**
 * ¡NUEVA! Se ejecuta 24h después de la Muerte Súbita
 */
async function finalizarDesempate(client, canal) {
  console.log('Finalizando Muerte Súbita...');
  await setFase('finalizada');
  const resultados = await getResultadosDesempate();
  const puntuaciones = await getPuntuaciones(); // Obtenemos los puntos *totales*
  
  // Quitar permisos a todos
  try {
    for (const votanteId of config.votantes) {
        await canal.permissionOverwrites.delete(votanteId);
    }
    console.log('Permisos de Muerte Súbita eliminados.');
  } catch(e) {
      console.error('Error quitando permisos de desempate:', e.message);
  }

  await canal.send("🛑 **¡LA MUERTE SÚBITA HA TERMINADO!** 🛑");

  if (resultados.length === 0) {
    await canal.send("Nadie votó en el desempate. Se usará el número de votos `/favor` originales para desempatar.");
    // (Lógica Error Punto 3: desempate secundario)
    // ... (Anunciar ganador basado en 'votos_favor_originales' de la tabla 'candidatos')
    return;
  }

  if (resultados.length > 1 && resultados[0].votos === resultados[1].votos) {
    await canal.send("Increíblemente, ¡HAY OTRO EMPATE! El ganador se decidirá por los votos `/favor` originales.");
    // (Lógica Error Punto 3)
    // ...
    return;
  }

  // Anunciar ganadores (los 3 primeros + el ganador del desempate)
  const ganadoresPrincipales = puntuaciones.slice(0, 3);
  const ganadorDesempate = await client.users.fetch(resultados[0].voto_a);

  let anuncio = "Los 4 nuevos administradores son:\n";
  ganadoresPrincipales.forEach((g, i) => {
    anuncio += `**${i+1}.** <@${g.user_id}> con **${g.puntos}** puntos\n`;
  });
  anuncio += `**4.** ${ganadorDesempate.tag} (Ganador de la Muerte Súbita)\n`;
  
  await canal.send(anuncio);
}

// --- EL PROGRAMADOR DE TAREAS (CRON) ---

function startScheduler(client) {
  console.log('Scheduler iniciado.');
  
  const zonaHoraria = "America/Santiago"; // ¡¡¡IMPORTANTE!!! CAMBIA ESTO A TU ZONA HORARIA
  
  const cronOptions = {
    timezone: zonaHoraria
  };
  
  // 0 16 * * * = 4:00 PM (16:00)
  cron.schedule('0 16 * * *', async () => {
    console.log('CRON 16:00: Iniciando Turno Tarde');
    const canalVotacion = await client.channels.fetch(config.canalVotacion);
    const turnoActual = await getTurnoActualIndex();
    await cerrarTurno(client, canalVotacion);
    await iniciarTurno(client, canalVotacion, turnoActual + 1);
  }, cronOptions);

  // 0 0 * * * = 12:00 AM (Medianoche)
  cron.schedule('0 0 * * *', async () => {
    console.log('CRON 00:00: Cerrando Turno Tarde');
    const canalVotacion = await client.channels.fetch(config.canalVotacion);
    await cerrarTurno(client, canalVotacion);
    await canalVotacion.send("El tribunal descansa hasta las 8 AM.");
  }, cronOptions);

  // 0 8 * * * = 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('CRON 08:00: Iniciando Turno Mañana');
    const canalVotacion = await client.channels.fetch(config.canalVotacion);
    const turnoActual = await getTurnoActualIndex();
    await iniciarTurno(client, canalVotacion, turnoActual + 1);
  }, cronOptions);
  
  console.log(`Cron jobs configurados en zona horaria: ${zonaHoraria}`);
}

// --- FUNCIÓN DE INICIO ESPECIAL (HOY 8 PM) ---
async function startTurno1Hoy(client) {
  const ahora = new Date();
  
  // Configuramos la hora de inicio para las 8 PM de hoy
  const horaInicio = new Date();
  horaInicio.setHours(20, 0, 0, 0); // 20:00:00.000

  const msHastaLas8 = horaInicio.getTime() - ahora.getTime();

  if (msHastaLas8 <= 0) {
    console.log('Ya pasaron las 8 PM. Inicia manualmente si es necesario o espera al cron de las 12 AM.');
    return;
  }

  console.log(`Turno 1 programado para las 8 PM. Faltan ${msHastaLas8 / 1000} segundos.`);

  setTimeout(async () => {
    console.log('¡INICIANDO TURNO 1 ESPECIAL!');
    const canalVotacion = await client.channels.fetch(config.canalVotacion);
    if (!canalVotacion) {
      console.error('No se encontró el canal para iniciar el Turno 1.');
      return;
    }
    const fase = await getFase();
    const turnoIndex = await getTurnoActualIndex();

    if (fase === 'votacion' && turnoIndex === 1) {
      await canalVotacion.send("🔥 **¡COMIENZA EL TRIBUNAL!** 🔥");
      await canalVotacion.send(`El primer turno, más corto, es desde ahora hasta las 12 AM (Medianoche).`);
      await iniciarTurno(client, canalVotacion, 1);
    } else {
      console.log('El turno 1 ya parece haber iniciado o la fase no es correcta.');
    }
  }, msHastaLas8);
}

module.exports = { startScheduler, startTurno1Hoy };