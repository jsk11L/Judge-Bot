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
    
    const candidatosEmpatados = puntuaciones.filter(c => parseInt(c.puntos, 10) === puntajeCorte).map(c => c.user_id);
    await setCandidatosDesempate(candidatosEmpatados);
    await setFase('desempate');

    let anuncio = "🛑 **¡HAY UN EMPATE EN EL 4to LUGAR!** 🛑\n\n";
    anuncio += "Los siguientes candidatos se enfrentarán en una **MUERTE SÚBITA** de 24 horas:\n";
    candidatosEmpatados.forEach(id => {
      anuncio += `  - <@${id}>\n`;
    });
    anuncio += `\nLos 18 votantes originales ahora pueden usar \`/desempate @candidato\` para decidir el ganador.`;
    
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

    const finDesempate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [min, hora, dia, mes] = [finDesempate.getMinutes(), finDesempate.getHours(), finDesempate.getDate(), finDesempate.getMonth() + 1];
    console.log(`Programando final de desempate para: ${dia}/${mes} ${hora}:${min}`);
    
    cron.schedule(`${min} ${hora} ${dia} ${mes} *`, async () => {
      await finalizarDesempate(client, canal);
    }, { timezone: "America/Santiago", scheduled: true });

  } else {
    console.log('No hay empate. Anunciando ganadores.');
    await setFase('finalizada');
    await canal.send("🛑 **¡LA VOTACIÓN HA TERMINADO!** 🛑");

    const ganadores = puntuaciones.slice(0, 4);
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
  const puntuaciones = await getPuntuaciones();
  
  try {
    for (const votanteId of config.votantes) {
        await canal.permissionOverwrites.delete(votanteId);
    }
    console.log('Permisos de Muerte Súbita eliminados.');
  } catch(e) {
      console.error('Error quitando permisos de desempate:', e.message);
  }

  await canal.send("🛑 **¡LA MUERTE SÚBITA HA TERMINADO!** 🛑");

  // Lógica de desempate secundario (Error Punto 3)
  if (resultados.length === 0 || (resultados.length > 1 && resultados[0].votos === resultados[1].votos)) {
      if (resultados.length === 0) {
        await canal.send("Nadie votó en el desempate...");
      } else {
        await canal.send("¡Increíblemente, HAY OTRO EMPATE!...");
      }
      await canal.send("El ganador se decidirá por los votos `/favor` originales.");

      const candidatosEmpatados = await getCandidatosDesempate();
      const puntosOriginales = puntuaciones.filter(p => candidatosEmpatados.includes(p.user_id));
      
      // Ordenar por votos_favor_originales
      puntosOriginales.sort((a, b) => b.votos_favor_originales - a.votos_favor_originales);

      // Manejar un posible empate incluso aquí (aunque es muy raro)
      if (puntosOriginales.length > 1 && puntosOriginales[0].votos_favor_originales === puntosOriginales[1].votos_favor_originales) {
        await canal.send("Sigue habiendo empate. El primer candidato en la lista (`" + (await client.users.fetch(puntosOriginales[0].user_id)).tag + "`) gana por antigüedad.");
      }

      const ganadorId = puntosOriginales[0].user_id;
      const ganadoresPrincipales = puntuaciones.slice(0, 3);
      
      let anuncio = "Los 4 nuevos administradores son:\n";
      ganadoresPrincipales.forEach((g, i) => {
        anuncio += `**${i+1}.** <@${g.user_id}> con **${g.puntos}** puntos\n`;
      });
      anuncio += `**4.** <@${ganadorId}> (Ganador por votos /favor originales)\n`;
      await canal.send(anuncio);
      return;
  }

  // Hay un ganador claro en la Muerte Súbita
  const ganadoresPrincipales = puntuaciones.slice(0, 3);
  const ganadorId = resultados[0].voto_a;
  const ganadorPuntos = resultados[0].votos;
  const ganadorUser = await client.users.fetch(ganadorId);

  let anuncio = "Los 4 nuevos administradores son:\n";
  ganadoresPrincipales.forEach((g, i) => {
    anuncio += `**${i+1}.** <@${g.user_id}> con **${g.puntos}** puntos\n`;
  });
  anuncio += `**4.** <@${ganadorUser.id}> (Ganador de la Muerte Súbita con ${ganadorPuntos} votos)\n`;
  
  await canal.send(anuncio);
}

// --- EL PROGRAMADOR DE TAREAS (CRON) ---

function startScheduler(client) {
  console.log('Scheduler iniciado.');
  const zonaHoraria = "America/Santiago"; // ¡¡¡IMPORTANTE!!! CAMBIA ESTO A TU ZONA HORARIA
  const cronOptions = { timezone: zonaHoraria };
  
  // 4:00 PM
  cron.schedule('0 16 * * *', async () => {
    console.log('CRON 16:00: Iniciando Turno Tarde');
    const canalVotacion = await client.channels.fetch(config.canalVotacion);
    const turnoActual = await getTurnoActualIndex();
    await cerrarTurno(client, canalVotacion);
    await iniciarTurno(client, canalVotacion, turnoActual + 1);
  }, cronOptions);

  // 12:00 AM (Medianoche)
  cron.schedule('0 0 * * *', async () => {
    console.log('CRON 00:00: Cerrando Turno Tarde');
    const canalVotacion = await client.channels.fetch(config.canalVotacion);
    await cerrarTurno(client, canalVotacion);
    await canalVotacion.send("El tribunal descansa hasta las 8 AM.");
  }, cronOptions);

  // 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('CRON 08:00: Iniciando Turno Mañana');
    const canalVotacion = await client.channels.fetch(config.canalVotacion);
    const turnoActual = await getTurnoActualIndex();
    await iniciarTurno(client, canalVotacion, turnoActual + 1);
  }, cronOptions);
  
  console.log(`Cron jobs configurados en zona horaria: ${zonaHoraria}`);
  // ================================================
  // --- PARCHE TEMPORAL (EJECUTAR AHORA Y BORRAR) ---
  // ================================================

  // 1. AJUSTA ESTA HORA Y MINUTO
  // (Debe ser unos minutos en el futuro, usando la hora de 'America/Santiago')
  const HORA_PARCHE = 16; 
  const MINUTO_PARCHE = 35; // Ej: Si son las 16:32, pon 16 y 35

  console.log(`[PARCHE] Programando ejecución de parche única para las ${HORA_PARCHE}:${MINUTO_PARCHE}`);

  const parcheJob = cron.schedule(`${MINUTO_PARCHE} ${HORA_PARCHE} * * *`, async () => {
    console.log('[PARCHE] ¡Ejecutando parche del turno de las 16:00!');
    
    try {
      const canalVotacion = await client.channels.fetch(config.canalVotacion);
      if (!canalVotacion) {
          console.error('[PARCHE] No se encontró el canal de votación.');
          parcheJob.stop();
          return;
      }

      const fase = await getFase();
      if (fase !== 'votacion') {
          console.log('[PARCHE] La fase no es "votacion", no se hace nada.');
          parcheJob.stop();
          return;
      }
      
      const turnoActual = await getTurnoActualIndex();
      
      console.log(`[PARCHE] Cerrando turno ${turnoActual} (el que debió cerrar a las 16:00)`);
      await cerrarTurno(client, canalVotacion); // Llama a la función que ya existe en el archivo
      
      console.log(`[PARCHE] Iniciando turno ${turnoActual + 1}`);
      await iniciarTurno(client, canalVotacion, turnoActual + 1); // Llama a la función que ya existe
      
      console.log('[PARCHE] Parche ejecutado con éxito.');
    
    } catch (err) {
      console.error('[PARCHE] Error ejecutando el parche:', err);
    } finally {
      // 5. ¡MUY IMPORTANTE! Detener el job para que no se ejecute mañana.
      parcheJob.stop();
      console.log('[PARCHE] El cron job del parche ha sido detenido y no volverá a ejecutarse.');
    }
    
  }, {
    timezone: zonaHoraria, // Usa la misma zona horaria del scheduler
    scheduled: true
  });
  // ================================================
  // --- FIN DEL PARCHE ---
  // ================================================
}

// --- ¡FUNCIÓN CORREGIDA PARA EL INICIO ESPECIAL! ---
async function startTurno1Hoy(client) {
  const zonaHoraria = "America/Santiago"; // ¡Asegúrate que sea la tuya!
  
  // Obtenemos la fecha actual en la zona horaria correcta
  const ahoraStr = new Date().toLocaleString("en-US", { timeZone: zonaHoraria });
  const ahora = new Date(ahoraStr);
  
  // Si ya son las 9 PM o más, no hacemos nada
  if (ahora.getHours() >= 21) {
    console.log('Ya pasaron las 9 PM. Inicia manualmente si es necesario o espera al cron de las 12 AM.');
    return;
  }
  
  const dia = ahora.getDate();
  const mes = ahora.getMonth() + 1; // getMonth() es 0-11
  
  // Programar el job para las 21:00 (9 PM) del día de HOY.
  // Formato: (Minuto Hora Día Mes *)
  const cronTime = `0 21 ${dia} ${mes} *`; // 0 21 9 11 *
  console.log(`Programando Turno 1 especial para las 9 PM (21:00) de hoy (${cronTime}) en ${zonaHoraria}`);

  const cronJob = cron.schedule(cronTime, async () => {
    console.log('¡INICIANDO TURNO 1 ESPECIAL (9 PM)!');
    const canalVotacion = await client.channels.fetch(config.canalVotacion);
    if (!canalVotacion) {
      console.error('No se encontró el canal para iniciar el Turno 1.');
      cronJob.stop(); // Detener para no reintentar
      return;
    }
    
    const fase = await getFase();
    const turnoIndex = await getTurnoActualIndex();

    if (fase === 'votacion' && turnoIndex === 1) {
      await canalVotacion.send("🔥 **¡COMIENZA EL TRIBUNAL!** 🔥");
      await canalVotacion.send(`El primer turno, más corto, es desde ahora (9 PM) hasta las 12 AM (Medianoche).`);
      await iniciarTurno(client, canalVotacion, 1);
    } else {
      console.log('El turno 1 ya parece haber iniciado o la fase no es correcta.');
    }
    
    // Detenemos el job para que no se ejecute el próximo año
    cronJob.stop();
    console.log('Cron job del Turno 1 especial detenido.');
    
  }, {
    timezone: zonaHoraria,
    scheduled: true
  });
}

module.exports = { startScheduler, startTurno1Hoy };