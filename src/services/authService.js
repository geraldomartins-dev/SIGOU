const { randomBytes, createHash } = require('node:crypto');
const { getDatabase } = require('../db');
const { verifyPassword } = require('../utils/password');

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

function login(username, password) {
  const db = getDatabase();
  const user = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1').get(username);
  if (!user || !verifyPassword(password, user.senha_salt, user.senha_hash)) return null;
  const token = randomBytes(32).toString('base64url');
  db.prepare("DELETE FROM sessoes WHERE expira_em <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").run();
  db.prepare("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+8 hours'))")
    .run(tokenHash(token), user.id);
  return { token, usuario: { id: user.id, nome: user.nome, usuario: user.usuario, papel: user.papel } };
}

function findSession(token) {
  if (!token) return null;
  return getDatabase().prepare(`SELECT u.id, u.nome, u.usuario, u.papel FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.expira_em > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND u.ativo = 1`).get(tokenHash(token));
}

function logout(token) {
  if (token) getDatabase().prepare('DELETE FROM sessoes WHERE token_hash = ?').run(tokenHash(token));
}

module.exports = { login, findSession, logout };
