// database.js
const sqlite3 = require('sqlite3').verbose();
const config = require('./config.json');

// --- Cuidado aquí:
// Para Render (producción): '/data/tribunal.db'
// Para pruebas locales (en tu PC): './tribunal.db'
const dbPath = process.env.NODE_ENV === 'production' ? '/data/tribunal.db' : './tribunal.db';
const db = new sqlite3.Database(dbPath);

/*
 * UTILERÍAS DE BASE DE DATOS (Promesas)
 * sqlite3 usa callbacks, pero nosotros queremos usar async/await.
 * Estas funciones "envuelven" los comandos de la DB en Promesas.
*/
function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) { // Usamos 'function' para tener 'this'
      if (err) return reject(err);
      resolve(this); // 'this' contiene lastID y changes
    });
  });
}

function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// --- FUNCIÓN DE INICIALIZACIÓN ---

/**
 * Revuelve un array (algoritmo Fisher-Yates)
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Crea las tablas y las llena si están vacías.
 * Esta es la función clave de "arranque" y orden secreto.
 */
async function setupTables() {
  console.log('Inicializando la base de datos...');
  
  // 1. Tabla de Estado (fase, turno, etc.)
  await dbRun(`CREATE TABLE IF NOT EXISTS estado (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // 2. Tabla de Candidatos (puntos)
  await dbRun(`CREATE TABLE IF NOT EXISTS candidatos (
    user_id TEXT PRIMARY KEY,
    puntos INTEGER DEFAULT 0,
    votos_favor_originales INTEGER DEFAULT 0
  )`);

  // 3. Tabla de Votantes (orden y estado de voto)
  await dbRun(`CREATE TABLE IF NOT EXISTS votantes (
    user_id TEXT PRIMARY KEY,
    orden_turno INTEGER UNIQUE,
    ha_votado_favor INTEGER DEFAULT 0,
    ha_votado_contra INTEGER DEFAULT 0,
    voto_favor_a TEXT,
    voto_contra_a TEXT
  )`);

  // 4. Llenar las tablas (SOLO SI ESTÁN VACÍAS)
  const votanteCount = await dbGet('SELECT COUNT(*) as count FROM votantes');
  
  if (votanteCount.count === 0) {
    console.log('Base de datos vacía. Configurando votantes y candidatos...');
    
    // Insertar estado inicial
    await dbRun("INSERT INTO estado (key, value) VALUES ('fase', 'votacion')");
    await dbRun("INSERT INTO estado (key, value) VALUES ('turno_actual_index', '1')"); // Empezamos en el turno 1

    // Insertar candidatos
    const candidateInserts = config.candidatos.map(id => 
      dbRun('INSERT INTO candidatos (user_id) VALUES (?)', [id])
    );
    await Promise.all(candidateInserts);

    // Insertar votantes con ORDEN SECRETO
    const votantesSorteados = shuffle([...config.votantes]); // Copia y revuelve
    const votanteInserts = votantesSorteados.map((id, index) => {
      const orden = index + 1; // 1-based index
      return dbRun('INSERT INTO votantes (user_id, orden_turno) VALUES (?, ?)', [id, orden]);
    });
    await Promise.all(votanteInserts);
    
    console.log('¡Base de datos inicializada y sorteada!');
  } else {
    console.log('La base de datos ya existe.');
  }
}

// --- FUNCIONES DE "GETTER" (Obtener datos) ---

async function getFase() {
  const row = await dbGet("SELECT value FROM estado WHERE key = 'fase'");
  return row ? row.value : null;
}

async function getTurnoActualIndex() {
  const row = await dbGet("SELECT value FROM estado WHERE key = 'turno_actual_index'");
  return row ? parseInt(row.value, 10) : 1;
}

async function getVotantePorTurno(index) {
  return dbGet('SELECT * FROM votantes WHERE orden_turno = ?', [index]);
}

async function getVotanteEstado(userId) {
  return dbGet('SELECT * FROM votantes WHERE user_id = ?', [userId]);
}

async function getPuntuaciones() {
  // Devuelve la tabla de puntuaciones (ej. para el recuento)
  return dbAll('SELECT * FROM candidatos ORDER BY puntos DESC, votos_favor_originales DESC');
}

// --- FUNCIONES DE "SETTER" (Modificar datos) ---

async function setFase(fase) {
  return dbRun("UPDATE estado SET value = ? WHERE key = 'fase'", [fase]);
}

async function setTurnoActualIndex(index) {
  return dbRun("UPDATE estado SET value = ? WHERE key = 'turno_actual_index'", [index]);
}

async function setVoto(votanteId, tipo, candidatoId) {
  // tipo debe ser 'favor' o 'contra'
  const campo_ha_votado = tipo === 'favor' ? 'ha_votado_favor' : 'ha_votado_contra';
  const campo_voto_a = tipo === 'favor' ? 'voto_favor_a' : 'voto_contra_a';

  return dbRun(`UPDATE votantes SET ${campo_ha_votado} = 1, ${campo_voto_a} = ? WHERE user_id = ?`, [candidatoId, votanteId]);
}

async function addPuntos(candidatoId, puntos) {
  return dbRun('UPDATE candidatos SET puntos = puntos + ? WHERE user_id = ?', [puntos, candidatoId]);
}

async function addVotosFavorOriginales(candidatoId) {
  // Para el desempate 2.0
  return dbRun('UPDATE candidatos SET votos_favor_originales = votos_favor_originales + 1 WHERE user_id = ?', [candidatoId]);
}

// Exportamos todas las funciones que usará el bot
module.exports = {
  setupTables,
  getFase,
  setFase,
  getTurnoActualIndex,
  setTurnoActualIndex,
  getVotantePorTurno,
  getVotanteEstado,
  getPuntuaciones,
  setVoto,
  addPuntos,
  addVotosFavorOriginales
};