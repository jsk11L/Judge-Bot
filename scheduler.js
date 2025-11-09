// scheduler.js
const cron = require('node-cron');
const { db, getTurnoActualIndex, getVotantePorTurno, getPuntuaciones, setTurnoActualIndex, getFase } = require('./database.js');
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
  if (fase !== 'votacion') return; // No hacer nada si no estamos votando

  const turnoIndex = await getTurnoActualIndex();
  const votante = await getVotantePorTurno(turnoIndex);
  
  // Quitar permisos al votante (si existe)
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

  // Postear el recuento final del turno
  const tabla = await generarTablaPuntuaciones();
  const rolTribunal = config.rolTribunal ? `<@&${config.rolTribunal}>` : '@here';
  
  await canal.send(`${rolTribunal} ¡El turno ha terminado!`);
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
    await finalizarVotacion(client, canal);
    return;
  }

  await setTurnoActualIndex(nuevoTurnoIndex);
  const votante = await getVotantePorTurno(nuevoTurnoIndex);

  if (!votante) {
    console.error(`Error: No se encontró el votante para el turno ${nuevoTurnoIndex}`);
    return;
  }

  // Dar permisos
  try {
    await canal.permissionOverwrites.edit(votante.user_id, {
      SendMessages: true // Permite chatear y usar comandos
    });
    // Asegurar que @everyone no puede escribir
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
 * Lógica de finalización
 */
async function finalizarVotacion(client, canal) {
  console.log('Finalizando votación principal...');
  const puntuaciones = await getPuntuaciones();

  // 1. Revisar si hay ganadores claros (top 4)
  if (puntuaciones.length < 4) {
    // Menos de 4 candidatos, todos ganan (o lo que sea)
    await canal.send("No hay suficientes candidatos para 4 puestos.");
    await setFase('finalizada');
    return;
  }

  const puntajeCorte = puntuaciones[3].puntos; // Puntos del 4to lugar
  
  // 2. Revisar si hay empate en el 4to lugar
  // (Si el 4to y 5to tienen los mismos puntos)
  if (puntuaciones.length > 4 && puntuaciones[4].puntos === puntajeCorte) {
    console.log(`¡EMPATE DETECTADO! Puntaje de corte: ${puntajeCorte}`);
    
    // 3. Hay empate. Iniciar Muerte Súbita.
    const candidatosEmpatados = puntuaciones.filter(c => c.puntos === puntajeCorte).map(c => c.user_id);
    await setCandidatosDesempate(candidatosEmpatados);
    await setFase('desempate');

    let anuncio = "🛑 **¡HAY UN EMPATE EN EL 4to LUGAR!** 🛑\n\n";
    anuncio += "Los siguientes candidatos se enfrentarán en una **MUERTE SÚBITA** de 24 horas:\n";
    candidatosEmpatados.forEach(id => {
      anuncio += `- <@${id}>\n`;
    });
    anuncio += "\nLos 18 votantes originales ahora pueden usar `/desempate @candidato` para decidir el ganador.";
    await canal.send(anuncio);

    // 4. Programar el fin del desempate para 24 horas después
    // Esto se ejecuta el 18 de Nov a las 4 PM. El desempate termina el 19 de Nov a las 4 PM.
    const finDesempate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [min, hora, dia, mes] = [finDesempate.getMinutes(), finDesempate.getHours(), finDesempate.getDate(), finDesempate.getMonth() + 1];

    console.log(`Programando final de desempate para: ${dia}/${mes} ${hora}:${min}`);
    
    schedule(`${min} ${hora} ${dia} ${mes} *`, async () => {
      await finalizarDesempate(client, canal);
    }, { timezone: "America/Santiago" }); // ¡MISMA ZONA HORARIA!

  } else {
    // 4. No hay empate. Anunciar ganadores.
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

async function finalizarDesempate(client, canal) {
  console.log('Finalizando Muerte Súbita...');
  await setFase('finalizada');
  const resultados = await getResultadosDesempate();
  
  await canal.send("🛑 **¡LA MUERTE SÚBITA HA TERMINADO!** 🛑");

  if (resultados.length === 0) {
    await canal.send("Nadie votó en el desempate. El resultado se decide por los votos `/favor` originales...");
    // (Aquí iría la lógica del Error Punto 3: desempate secundario)
    // ...
    return;
  }

  // Comprobar si hay un nuevo empate
  if (resultados.length > 1 && resultados[0].votos === resultados[1].votos) {
    await canal.send("Increíblemente, ¡HAY OTRO EMPATE! El ganador se decidirá por los votos `/favor` originales.");
    // (Lógica Error Punto 3)
    // ...
    return;
  }

  const ganadorId = resultados[0].voto_a;
  const ganadorPuntos = resultados[0].votos;
  await canal.send(`El ganador del 4to puesto es <@${ganadorId}> con ${ganadorPuntos} votos.`);
}


// --- EL PROGRAMADOR DE TAREAS (CRON) ---

function startScheduler(client) {
  console.log('Scheduler iniciado.');
  const canalVotacion = client.channels.cache.get(config.canalVotacion);
  if (!canalVotacion) {
    console.error('Error: No se encontró el canal de votación.');
    return;
  }

  // 0 16 * * * = 4:00 PM (16:00)
  cron.schedule('0 16 * * *', async () => {
    console.log('CRON 16:00: Iniciando Turno Tarde');
    const turnoActual = await getTurnoActualIndex();
    await cerrarTurno(client, canalVotacion);
    await iniciarTurno(client, canalVotacion, turnoActual + 1);
  }, { timezone: "America/Santiago" }); // ¡Ajusta tu zona horaria!

  // 0 0 * * * = 12:00 AM (Medianoche)
  cron.schedule('0 0 * * *', async () => {
    console.log('CRON 00:00: Cerrando Turno Tarde');
    await cerrarTurno(client, canalVotacion);
    await canalVotacion.send("El tribunal descansa hasta las 8 AM.");
  }, { timezone: "America/Santiago" });

  // 0 8 * * * = 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('CRON 08:00: Iniciando Turno Mañana');
    const turnoActual = await getTurnoActualIndex();
    // Nota: El turno se "cierra" a las 12 AM, pero el índice
    // no avanza hasta el siguiente turno.
    // Si el turno 00:00 cerró el 3, este inicia el 4.
    await iniciarTurno(client, canalVotacion, turnoActual + 1);
  }, { timezone: "America/Santiago" });
}

// --- FUNCIÓN DE INICIO ESPECIAL (HOY 8 PM) ---
async function startTurno1Hoy(client) {
  const ahora = new Date();
  // ¡Asegúrate que tu servidor local/host esté en la zona horaria correcta!
  // Chile continental es -3 (GMT-3)
  const horaInicio = new Date();
  horaInicio.setHours(20, 0, 0, 0); // Hoy a las 8:00 PM

  const msHastaLas8 = horaInicio.getTime() - ahora.getTime();

  if (msHastaLas8 < 0) {
    console.log('Ya pasaron las 8 PM. Inicia manualmente si es necesario.');
    return;
  }

  console.log(`Turno 1 programado para las 8 PM. Faltan ${msHastaLas8 / 1000} segundos.`);

  setTimeout(async () => {
    console.log('¡INICIANDO TURNO 1 ESPECIAL!');
    const canalVotacion = client.channels.cache.get(config.canalVotacion);
    if (!canalVotacion) {
      console.error('No se encontró el canal para iniciar el Turno 1.');
      return;
    }
    const fase = await getFase();
    const turnoIndex = await getTurnoActualIndex();

    if (fase === 'votacion' && turnoIndex === 1) {
      await canalVotacion.send("🔥 **¡COMIENZA EL TRIBUNAL!** 🔥");
      await canalVotacion.send("El primer turno, más corto, es de 8 PM a 12 AM.");
      await iniciarTurno(client, canalVotacion, 1);
    } else {
      console.log('El turno 1 ya parece haber iniciado o la fase no es correcta.');
    }
  }, msHastaLas8);
}

module.exports = { startScheduler, startTurno1Hoy };