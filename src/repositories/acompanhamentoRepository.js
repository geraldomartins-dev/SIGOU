const { createHash, randomBytes } = require('node:crypto');
const { getDatabase } = require('../db');

const columns = 'd.id, d.titulo, d.status, d.verificacao_status';
const hashKey = (key) => createHash('sha256').update(key).digest('hex');

async function createKey(db, reportId) {
  const key = randomBytes(24).toString('base64url');
  await db.run('INSERT INTO acessos_acompanhamento (denuncia_id, chave_hash) VALUES (?, ?)', [reportId, hashKey(key)]);
  return key;
}

async function findByKey(key) {
  const db = await getDatabase();
  return db.get('SELECT ' + columns + ' FROM acessos_acompanhamento a JOIN denuncias d ON d.id = a.denuncia_id WHERE a.chave_hash = ?', [hashKey(key)]);
}

async function findReport(id) {
  const db = await getDatabase();
  return db.get('SELECT ' + columns + ', a.denuncia_id IS NOT NULL AS tem_acesso FROM denuncias d LEFT JOIN acessos_acompanhamento a ON a.denuncia_id = d.id WHERE d.id = ?', [id]);
}

async function findRecent() {
  const db = await getDatabase();
  return db.all([
    'SELECT ' + columns + ', m.autor AS ultima_mensagem',
    'FROM acessos_acompanhamento a JOIN denuncias d ON d.id = a.denuncia_id',
    'LEFT JOIN mensagens_denuncia m ON m.id = (SELECT MAX(id) FROM mensagens_denuncia WHERE denuncia_id = d.id)',
    'ORDER BY m.id DESC, d.id DESC LIMIT 40'
  ].join(' '));
}

async function listMessages(id) {
  const db = await getDatabase();
  return db.all('SELECT id, autor, texto, enviada_ms FROM mensagens_denuncia WHERE denuncia_id = ? ORDER BY id', [id]);
}

async function writeMessage(id, author, text) {
  const db = await getDatabase();
  const sentAt = Date.now();
  const result = await db.run(
    'INSERT INTO mensagens_denuncia (denuncia_id, autor, texto, enviada_ms) VALUES (?, ?, ?, ?)',
    [id, author, text, sentAt]
  );
  return { id: result.insertId, autor: author, texto: text, enviada_ms: sentAt };
}

module.exports = { createKey, findByKey, findReport, findRecent, listMessages, writeMessage };
