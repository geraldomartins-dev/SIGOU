const { getDatabase } = require('../db');

function create(data) {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO denuncias (titulo, descricao, grau_urgencia, latitude, longitude, contato, evidencia_url, confianca)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.titulo.trim(), data.descricao.trim(), data.grau_urgencia, data.latitude, data.longitude,
    data.contato || null, data.evidencia_url || null, data.confianca);
  return findById(Number(result.lastInsertRowid));
}

function findById(id) {
  return getDatabase().prepare('SELECT * FROM denuncias WHERE id = ?').get(id);
}

function findActive() {
  return getDatabase().prepare(`
    SELECT * FROM denuncias
    WHERE status IN ('PENDENTE', 'EM_ATENDIMENTO') AND verificacao_status != 'REJEITADA'
    ORDER BY criado_em DESC
  `).all();
}

function findPending() {
  return getDatabase().prepare(`
    SELECT * FROM denuncias
    WHERE status = 'PENDENTE'
      AND (verificacao_status = 'VALIDADA' OR (grau_urgencia = 4 AND verificacao_status = 'AGUARDANDO_VALIDACAO'))
    ORDER BY criado_em ASC
  `).all();
}

function updateVerification(id, verificationStatus, reason) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare(`
      UPDATE denuncias SET verificacao_status = ?, motivo_rejeicao = ?,
        confianca = CASE WHEN ? = 'VALIDADA' THEN MAX(confianca, 80) ELSE confianca END,
        verificado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?
    `).run(verificationStatus, reason || null, verificationStatus, id);
    if (result.changes) db.prepare('INSERT INTO verificacao_auditoria (denuncia_id, acao, justificativa) VALUES (?, ?, ?)').run(id, verificationStatus, reason || null);
    db.exec('COMMIT');
    return result.changes ? findById(id) : undefined;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function updateStatus(id, status) {
  const result = getDatabase().prepare(`
    UPDATE denuncias
    SET status = ?, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(status, id);
  return result.changes ? findById(id) : undefined;
}

module.exports = { create, findById, findActive, findPending, updateStatus, updateVerification };
