// database.js
const { Pool } = require('pg');
const config = require('./config.json');

// Render nos dará esta URL automáticamente como variable de entorno
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  // Requerido si estás hosteando en Render para conectarte a su DB
  ssl: {
    rejectUnauthorized: false
  }
});

// --- UTILERÍAS DE BASE DE DATOS (Promesas) ---
const dbRun = (query, params = []) => pool.query(query, params);
const dbGet = async (query, params = []) => {
  const { rows } = await pool.query(query, params);
  return rows[0];
};
const dbAll = async (query, params = []) => {
  const { rows } = await pool.query(query, params);
  return rows;
};

// --- FUNCIÓN DE INICIALIZACIÓN ---
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function setupTables() {
  console.log('Conectando a la base de datos PostgreSQL...');
  try {
    await pool.query('SELECT NOW()'); // Prueba de conexión
    console.log('Conexión a PostgreSQL exitosa.');
  } catch (err) {
    console.error("Error conectando a la base de datos:", err.message);
    process.exit(1);
  }
  
  console.log('Inicializando la base de datos (PostgreSQL)...');
  
  // 1. Tabla de Estado
  await dbRun(`CREATE TABLE IF NOT EXISTS estado (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // 2. Tabla de Candidatos
  await dbRun(`CREATE TABLE IF NOT EXISTS candidatos (
    user_id TEXT PRIMARY KEY,
    puntos INTEGER DEFAULT 0,
    votos_favor_originales INTEGER DEFAULT 0
  )`);

  // 3. Tabla de Votantes
  await dbRun(`CREATE TABLE IF NOT EXISTS votantes (
    user_id TEXT PRIMARY KEY,
    orden_turno INTEGER UNIQUE,
    ha_votado_favor INTEGER DEFAULT 0,
    ha_votado_contra INTEGER DEFAULT 0,
    voto_favor_a TEXT,
    voto_contra_a TEXT
  )`);
  
  // 4. Tabla de Muerte Súbita
  await dbRun(`CREATE TABLE IF NOT EXISTS desempate_votos (
    votante_id TEXT PRIMARY KEY,
    voto_a TEXT
  )`);

  // 5. Llenar las tablas (SOLO SI ESTÁN VACÍAS)
  const votanteCount = await dbGet('SELECT COUNT(*) as count FROM votantes');
  
  if (parseInt(votanteCount.count, 10) === 0) {
    console.log('Base de datos vacía. Configurando votantes y candidatos...');
    
    await dbRun("INSERT INTO estado (key, value) VALUES ('fase', 'votacion') ON CONFLICT (key) DO NOTHING");
    await dbRun("INSERT INTO estado (key, value) VALUES ('turno_actual_index', '1') ON CONFLICT (key) DO NOTHING");

    const candidateInserts = config.candidatos.map(id => 
      dbRun('INSERT INTO candidatos (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [id])
    );
    await Promise.all(candidateInserts);

    const votantesSorteados = shuffle([...config.votantes]);
    const votanteInserts = votantesSorteados.map((id, index) => {
      const orden = index + 1;
      return dbRun('INSERT INTO votantes (user_id, orden_turno) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [id, orden]);
    });
    await Promise.all(votanteInserts);
    
    console.log('¡Base de datos inicializada y sorteada!');
  } else {
    console.log('La base de datos ya existe.');
  }
}

// --- GETTERS ---
async function getFase() {
  const row = await dbGet("SELECT value FROM estado WHERE key = 'fase'");
  return row ? row.value : null;
}
async function getTurnoActualIndex() {
  const row = await dbGet("SELECT value FROM estado WHERE key = 'turno_actual_index'");
  return row ? parseInt(row.value, 10) : 1;
}
async function getVotantePorTurno(index) {
  return dbGet('SELECT * FROM votantes WHERE orden_turno = $1', [index]);
}
async function getVotanteEstado(userId) {
  return dbGet('SELECT * FROM votantes WHERE user_id = $1', [userId]);
}
async function getPuntuaciones() {
  return dbAll('SELECT * FROM candidatos ORDER BY puntos DESC, votos_favor_originales DESC');
}

// --- SETTERS ---
async function setFase(fase) {
  return dbRun("INSERT INTO estado (key, value) VALUES ('fase', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [fase]);
}
async function setTurnoActualIndex(index) {
  return dbRun("UPDATE estado SET value = $1 WHERE key = 'turno_actual_index'", [String(index)]);
}
async function setVoto(votanteId, tipo, candidatoId) {
  const campo_ha_votado = tipo === 'favor' ? 'ha_votado_favor' : 'ha_votado_contra';
  const campo_voto_a = tipo === 'favor' ? 'voto_favor_a' : 'voto_contra_a';
  return dbRun(`UPDATE votantes SET ${campo_ha_votado} = 1, ${campo_voto_a} = $1 WHERE user_id = $2`, [candidatoId, votanteId]);
}
async function addPuntos(candidatoId, puntos) {
  return dbRun('UPDATE candidatos SET puntos = puntos + $1 WHERE user_id = $2', [puntos, candidatoId]);
}
async function addVotosFavorOriginales(candidatoId) {
  return dbRun('UPDATE candidatos SET votos_favor_originales = votos_favor_originales + 1 WHERE user_id = $1', [candidatoId]);
}

// --- FUNCIONES DE DESEMPATE ---
async function getCandidatosDesempate() {
  const row = await dbGet("SELECT value FROM estado WHERE key = 'candidatos_desempate'");
  return row ? JSON.parse(row.value) : [];
}
async function setCandidatosDesempate(candidatosIds) {
  const json = JSON.stringify(candidatosIds);
  return dbRun("INSERT INTO estado (key, value) VALUES ('candidatos_desempate', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [json]);
}
async function haVotadoDesempate(votanteId) {
  const row = await dbGet('SELECT 1 FROM desempate_votos WHERE votante_id = $1', [votanteId]);
  return !!row;
}
async function addVotoDesempate(votanteId, candidatoId) {
  await dbRun('INSERT INTO desempate_votos (votante_id, voto_a) VALUES ($1, $2)', [votanteId, candidatoId]);
  return addPuntos(candidatoId, 1);
}
async function getResultadosDesempate() {
  return dbAll('SELECT voto_a, COUNT(*) as votos FROM desempate_votos GROUP BY voto_a ORDER BY votos DESC');
}

module.exports = {
  setupTables,
  getFase, setFase,
  getTurnoActualIndex, setTurnoActualIndex,
  getVotantePorTurno, getVotanteEstado,
  getPuntuaciones,
  setVoto, addPuntos, addVotosFavorOriginales,
  getCandidatosDesempate, setCandidatosDesempate,
  haVotadoDesempate, addVotoDesempate, getResultadosDesempate
};