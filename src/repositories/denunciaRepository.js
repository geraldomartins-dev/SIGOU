const { getDatabase } = require('../db');
const { createKey } = require('./acompanhamentoRepository');

async function create(data) {
  const db = await getDatabase();
  return db.transaction(async (tx) => {
    const result = await tx.run(`
      INSERT INTO denuncias (titulo, descricao, grau_urgencia, latitude, longitude, cidade, regiao, contato, telefone, email, consentimento_contato, evidencia_url, confianca, endereco)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.titulo.trim(), data.descricao.trim(), data.grau_urgencia, data.latitude, data.longitude,
      data.cidade || null, data.regiao || null,
      data.contato || null, data.telefone || null, data.email || null, data.consentimento_contato ? 1 : 0,
      data.evidencia_url || null, data.confianca, data.endereco || null]);
    const report = await tx.get('SELECT * FROM denuncias WHERE id = ?', [result.insertId]);
    const key = await createKey(tx, report.id);
    return { ...report, chave_acompanhamento: key };
  });
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
    SET status = ?,
      atendimento_iniciado_em = CASE WHEN ? = 'EM_ATENDIMENTO' AND atendimento_iniciado_em IS NULL THEN CURRENT_TIMESTAMP ELSE atendimento_iniciado_em END,
      concluido_em = CASE WHEN ? = 'CONCLUIDA' THEN CURRENT_TIMESTAMP ELSE concluido_em END,
      atualizado_em = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, status, status, id]);
  return result.affectedRows ? findById(id) : undefined;
}

async function findDashboardReports() {
  const db = await getDatabase();
  // MySQL grava CURRENT_TIMESTAMP no horário da sessão; o driver entrega Date em UTC.
  // Normaliza a leitura para o mesmo instante usado pelo SQLite e pelos filtros do painel.
  const dateColumns = ['criado_em', 'atendimento_iniciado_em', 'concluido_em'].map((column) => db.type === 'mysql'
    ? `TIMESTAMPADD(SECOND, TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP(), UTC_TIMESTAMP()), ${column}) AS ${column}`
    : column).join(', ');
  return db.all(`
    SELECT id, titulo, grau_urgencia, status, verificacao_status, cidade, regiao,
      latitude, longitude, ${dateColumns}
    FROM denuncias WHERE verificacao_status != 'REJEITADA' ORDER BY criado_em DESC
  `);
}

module.exports = { create, findById, findActive, findPending, findAwaitingValidation, findDashboardReports, updateStatus, updateVerification, updateContactStatus };
