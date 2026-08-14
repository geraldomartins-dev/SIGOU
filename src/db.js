const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATH, ROOT_DIR } = require('./config');
const { hashPassword } = require('./utils/password');

let database;

function getDatabase() {
  if (database) return database;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  database.exec(fs.readFileSync(path.join(ROOT_DIR, 'database', 'schema.sql'), 'utf8'));
  // Migração leve para bancos criados por versões anteriores do protótipo.
  const columns = new Set(database.prepare('PRAGMA table_info(denuncias)').all().map((column) => column.name));
  const migrations = [
    ['contato', 'ALTER TABLE denuncias ADD COLUMN contato TEXT'],
    ['evidencia_url', 'ALTER TABLE denuncias ADD COLUMN evidencia_url TEXT'],
    ['verificacao_status', "ALTER TABLE denuncias ADD COLUMN verificacao_status TEXT NOT NULL DEFAULT 'AGUARDANDO_VALIDACAO'"],
    ['confianca', 'ALTER TABLE denuncias ADD COLUMN confianca INTEGER NOT NULL DEFAULT 20'],
    ['motivo_rejeicao', 'ALTER TABLE denuncias ADD COLUMN motivo_rejeicao TEXT'],
    ['verificado_em', 'ALTER TABLE denuncias ADD COLUMN verificado_em TEXT']
  ];
  migrations.forEach(([column, sql]) => { if (!columns.has(column)) database.exec(sql); });
  database.exec('CREATE INDEX IF NOT EXISTS idx_denuncias_verificacao ON denuncias(verificacao_status)');
  const users = database.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total;
  if (users === 0) {
    const initialUser = process.env.CENTRAL_USER || 'operador';
    const initialPassword = process.env.CENTRAL_PASSWORD || 'sigou123';
    const password = hashPassword(initialPassword);
    database.prepare('INSERT INTO usuarios (nome, usuario, senha_hash, senha_salt, papel) VALUES (?, ?, ?, ?, ?)')
      .run('Operador inicial', initialUser, password.hash, password.salt, 'ADMIN');
    console.log(`Central: usuário inicial "${initialUser}" criado. Altere CENTRAL_PASSWORD fora do protótipo.`);
  }
  return database;
}

function closeDatabase() {
  if (database) database.close();
  database = undefined;
}

module.exports = { getDatabase, closeDatabase };
