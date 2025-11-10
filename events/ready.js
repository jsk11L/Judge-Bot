// events/ready.js
const { setupTables, getFase, getTurnoActualIndex } = require('../database.js');
const { startScheduler, startTurno1Hoy } = require('../scheduler.js');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    // 1. Preparar la base de datos
    await setupTables();

    // 2. Iniciar el programador de tareas
    startScheduler(client);

    // 3. Programar el inicio especial del Turno 1 (HOY)
    const fase = await getFase();
    const turnoIndex = await getTurnoActualIndex();
    if (fase === 'votacion' && turnoIndex === 1) {
      await startTurno1Hoy(client);
    }

    console.log(`¡Bot listo! Logueado como ${client.user.tag}`);
    client.user.setActivity('Supervisando el Tribunal');
  },
};