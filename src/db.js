const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const mysql = require('mysql2/promise');
const { DB_CLIENT, DB_PATH, MYSQL, ROOT_DIR } = require('./config');
const { hashPassword } = require('./utils/password');

let database;

async function createInitialUser(db) {
  const row = await db.get('SELECT COUNT(*) AS total FROM usuarios');
  if (Number(row.total) > 0) return;
  const username = process.env.CENTRAL_USER || 'operador';
  const password = hashPassword(process.env.CENTRAL_PASSWORD || 'sigou123');
  await db.run('INSERT INTO usuarios (nome, usuario, senha_hash, senha_salt, papel) VALUES (?, ?, ?, ?, ?)',
    ['Operador inicial', username, password.hash, password.salt, 'ADMIN']);
  console.log(`Central: usuário inicial "${username}" criado. Altere CENTRAL_PASSWORD fora do protótipo.`);
}

function sqliteAdapter() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const connection = new DatabaseSync(DB_PATH);
  connection.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  connection.exec(fs.readFileSync(path.join(ROOT_DIR, 'database', 'schema.sql'), 'utf8'));
  // Mantém bancos SQLite criados por versões beta anteriores compatíveis.
  const columns = new Set(connection.prepare('PRAGMA table_info(denuncias)').all().map((column) => column.name));
  const migrations = [
    ['contato', 'ALTER TABLE denuncias ADD COLUMN contato TEXT'],
    ['telefone', 'ALTER TABLE denuncias ADD COLUMN telefone TEXT'],
    ['email', 'ALTER TABLE denuncias ADD COLUMN email TEXT'],
    ['consentimento_contato', 'ALTER TABLE denuncias ADD COLUMN consentimento_contato INTEGER NOT NULL DEFAULT 0'],
    ['contato_status', "ALTER TABLE denuncias ADD COLUMN contato_status TEXT NOT NULL DEFAULT 'NAO_CONTATADO'"],
    ['evidencia_url', 'ALTER TABLE denuncias ADD COLUMN evidencia_url TEXT'],
    ['verificacao_status', "ALTER TABLE denuncias ADD COLUMN verificacao_status TEXT NOT NULL DEFAULT 'AGUARDANDO_VALIDACAO'"],
    ['confianca', 'ALTER TABLE denuncias ADD COLUMN confianca INTEGER NOT NULL DEFAULT 20'],
    ['motivo_rejeicao', 'ALTER TABLE denuncias ADD COLUMN motivo_rejeicao TEXT'],
    ['verificado_em', 'ALTER TABLE denuncias ADD COLUMN verificado_em TEXT']
  ];
  migrations.forEach(([column, sql]) => { if (!columns.has(column)) connection.exec(sql); });
  connection.exec('CREATE INDEX IF NOT EXISTS idx_denuncias_verificacao ON denuncias(verificacao_status)');
  return {
    type: 'sqlite',
    async get(sql, params = []) { return connection.prepare(sql).get(...params); },
    async all(sql, params = []) { return connection.prepare(sql).all(...params); },
    async run(sql, params = []) {
      const result = connection.prepare(sql).run(...params);
      return { insertId: Number(result.lastInsertRowid), affectedRows: result.changes };
    },
    async transaction(callback) {
      connection.exec('BEGIN IMMEDIATE');
      try { const result = await callback(this); connection.exec('COMMIT'); return result; }
      catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
    async close() { connection.close(); }
  };
}

async function mysqlAdapter() {
  const pool = mysql.createPool({
    host: MYSQL.host, port: MYSQL.port, user: MYSQL.user, password: MYSQL.password,
    database: MYSQL.database, waitForConnections: true, connectionLimit: 10,
    charset: 'utf8mb4', timezone: 'Z', multipleStatements: true
  });
  await pool.query(fs.readFileSync(path.join(ROOT_DIR, 'database', 'schema.mysql.sql'), 'utf8'));
  const adapter = {
    type: 'mysql',
    async get(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows[0]; },
    async all(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows; },
    async run(sql, params = []) {
      const [result] = await pool.execute(sql, params);
      return { insertId: result.insertId, affectedRows: result.affectedRows };
    },
    async transaction(callback) {
      const connection = await pool.getConnection();
      const tx = {
        get: async (sql, params = []) => (await connection.execute(sql, params))[0][0],
        all: async (sql, params = []) => (await connection.execute(sql, params))[0],
        run: async (sql, params = []) => {
          const [result] = await connection.execute(sql, params);
          return { insertId: result.insertId, affectedRows: result.affectedRows };
        }
      };
      try { await connection.beginTransaction(); const result = await callback(tx); await connection.commit(); return result; }
      catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async close() { await pool.end(); }
  };
  await pool.query('SELECT 1');
  return adapter;
}

async function getDatabase() {
  if (!database) {
    database = DB_CLIENT === 'mysql' ? await mysqlAdapter() : sqliteAdapter();
    await createInitialUser(database);
    console.log(`Banco conectado: ${database.type}.`);
  }
  return database;
}

async function closeDatabase() {
  if (database) await database.close();
  database = undefined;
}

module.exports = { getDatabase, closeDatabase };
