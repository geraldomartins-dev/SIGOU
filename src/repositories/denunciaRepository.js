const { getDatabase } = require('../db');

async function create(data) {
  const db = await getDatabase();
  const result = await db.run(`
    INSERT INTO denuncias (titulo, descricao, grau_urgencia, latitude, longitude, contato, telefone, email, consentimento_contato, evidencia_url, confianca)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [data.titulo.trim(), data.descricao.trim(), data.grau_urgencia, data.latitude, data.longitude,
    data.contato || null, data.telefone || null, data.email || null, data.consentimento_contato ? 1 : 0,
    data.evidencia_url || null, data.confianca]);
  return findById(Number(result.insertId));
}

async function findById(id) {
  return (await getDatabase()).get('SELECT * FROM denuncias WHERE id = ?', [id]);
}

async function findActive() {
  return (await getDatabase()).all(`
    SELECT * FROM denuncias
    WHERE status IN ('PENDENTE', 'EM_ATENDIMENTO') AND verificacao_status != 'REJEITADA'
    ORDER BY criado_em DESC
  `);
}

async function findPending() {
  return (await getDatabase()).all(`
    SELECT * FROM denuncias
    WHERE status = 'PENDENTE'
      AND (verificacao_status = 'VALIDADA' OR (grau_urgencia = 4 AND verificacao_status = 'AGUARDANDO_VALIDACAO'))
    ORDER BY criado_em ASC
  `);
}

async function findAwaitingValidation() {
  return (await getDatabase()).all(`
    SELECT * FROM denuncias
    WHERE status = 'PENDENTE' AND verificacao_status = 'AGUARDANDO_VALIDACAO'
    ORDER BY criado_em ASC
  `);
}

async function updateVerification(id, verificationStatus, reason) {
  const db = await getDatabase();
  const changed = await db.transaction(async (tx) => {
    const result = await tx.run(`
      UPDATE denuncias SET verificacao_status = ?, motivo_rejeicao = ?,
        confianca = CASE WHEN ? = 'VALIDADA' AND confianca < 80 THEN 80 ELSE confianca END,
        verificado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?
    `, [verificationStatus, reason || null, verificationStatus, id]);
    if (result.affectedRows) await tx.run('INSERT INTO verificacao_auditoria (denuncia_id, acao, justificativa) VALUES (?, ?, ?)', [id, verificationStatus, reason || null]);
    return result.affectedRows;
  });
  return changed ? findById(id) : undefined;
}

async function updateContactStatus(id, status, userId) {
  const db = await getDatabase();
  const changed = await db.transaction(async (tx) => {
    const result = await tx.run('UPDATE denuncias SET contato_status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
    if (result.affectedRows) await tx.run('INSERT INTO contato_auditoria (denuncia_id, usuario_id, status) VALUES (?, ?, ?)', [id, userId, status]);
    return result.affectedRows;
  });
  return changed ? findById(id) : undefined;
}

async function updateStatus(id, status) {
  const result = await (await getDatabase()).run(`
    UPDATE denuncias
    SET status = ?, atualizado_em = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, id]);
  return result.affectedRows ? findById(id) : undefined;
}

module.exports = { create, findById, findActive, findPending, findAwaitingValidation, updateStatus, updateVerification, updateContactStatus };
