const { randomBytes, createHash } = require('node:crypto');
const { getDatabase } = require('../db');
const { verifyPassword } = require('../utils/password');

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

async function login(username, password) {
  const db = await getDatabase();
  const user = await db.get('SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1', [username]);
  if (!user || !verifyPassword(password, user.senha_salt, user.senha_hash)) return null;
  const token = randomBytes(32).toString('base64url');
  await db.run('DELETE FROM sessoes WHERE expira_em <= CURRENT_TIMESTAMP');
  const expiration = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 23).replace('T', ' ');
  await db.run('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)', [tokenHash(token), user.id, expiration]);
  return { token, usuario: { id: user.id, nome: user.nome, usuario: user.usuario, papel: user.papel } };
}

async function findSession(token) {
  if (!token) return null;
  return (await getDatabase()).get(`SELECT u.id, u.nome, u.usuario, u.papel FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.expira_em > CURRENT_TIMESTAMP AND u.ativo = 1`, [tokenHash(token)]);
}

async function logout(token) {
  if (token) await (await getDatabase()).run('DELETE FROM sessoes WHERE token_hash = ?', [tokenHash(token)]);
}

module.exports = { login, findSession, logout };
