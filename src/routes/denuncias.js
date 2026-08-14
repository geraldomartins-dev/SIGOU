const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const multer = require('multer');
const repository = require('../repositories/denunciaRepository');
const { prioritizeReports } = require('../services/priorityService');
const { isInsideServiceArea } = require('../utils/serviceArea');
const { requireAuth } = require('../middleware/auth');
const { DB_PATH } = require('../config');

const router = express.Router();
const VALID_STATUSES = ['PENDENTE', 'EM_ATENDIMENTO', 'CONCLUIDA'];
const VALID_VERIFICATION_STATUSES = ['VALIDADA', 'REJEITADA'];
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(null, true);
    const error = new Error('A foto deve ser JPG, PNG ou WebP.'); error.status = 400;
    return callback(error);
  }
});

function calculateInitialConfidence({ descricao, telefone, email, evidencia_url }) {
  return Math.min(100, 20 + (descricao.trim().length >= 40 ? 10 : 0) + (telefone || email ? 15 : 0) + (evidencia_url ? 30 : 0));
}

function validImageSignature(file) {
  if (!file) return true;
  const hex = file.buffer.subarray(0, 12).toString('hex');
  if (file.mimetype === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (file.mimetype === 'image/png') return hex.startsWith('89504e470d0a1a0a');
  return file.mimetype === 'image/webp' && hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
}

function validCoordinate(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

router.post('/', upload.single('foto'), (req, res) => {
  const titulo = req.body.titulo;
  const descricao = req.body.descricao;
  const grau_urgencia = Number(req.body.grau_urgencia);
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  const contato = req.body.contato;
  const telefone = typeof req.body.telefone === 'string' ? req.body.telefone.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const consentimento_contato = req.body.consentimento_contato === 'true' || req.body.consentimento_contato === true;
  const errors = [];
  if (typeof titulo !== 'string' || titulo.trim().length < 3 || titulo.trim().length > 120) errors.push('Título deve ter entre 3 e 120 caracteres.');
  if (typeof descricao !== 'string' || descricao.trim().length < 3 || descricao.trim().length > 1000) errors.push('Descrição deve ter entre 3 e 1000 caracteres.');
  if (!Number.isInteger(grau_urgencia) || grau_urgencia < 1 || grau_urgencia > 4) errors.push('Grau de urgência deve ser um inteiro entre 1 e 4.');
  if (!validCoordinate(latitude, -90, 90)) errors.push('Latitude inválida.');
  if (!validCoordinate(longitude, -180, 180)) errors.push('Longitude inválida.');
  if (validCoordinate(latitude, -90, 90) && validCoordinate(longitude, -180, 180)
    && !isInsideServiceArea(latitude, longitude)) {
    errors.push('A localização deve estar no estado de São Paulo ou no norte do Paraná.');
  }
  if (contato != null && (typeof contato !== 'string' || contato.trim().length > 100)) errors.push('Contato inválido.');
  if (telefone && !/^\+?[\d\s().-]{10,20}$/.test(telefone)) errors.push('Telefone inválido.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('E-mail inválido.');
  if ((telefone || email) && !consentimento_contato) errors.push('Autorize o contato para informar telefone ou e-mail.');
  if (req.file && !['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) errors.push('A foto deve ser JPG, PNG ou WebP.');
  if (!validImageSignature(req.file)) errors.push('O conteúdo do arquivo não corresponde a uma imagem válida.');
  if (errors.length) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors });

  let evidencia_url;
  if (req.file) {
    const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype];
    const uploadDirectory = path.join(path.dirname(DB_PATH), 'uploads');
    fs.mkdirSync(uploadDirectory, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    fs.writeFileSync(path.join(uploadDirectory, filename), req.file.buffer);
    evidencia_url = `/uploads/${filename}`;
  }
  const data = { titulo, descricao, grau_urgencia, latitude, longitude, contato: contato?.trim(), telefone, email, consentimento_contato, evidencia_url };
  return res.status(201).json(repository.create({ ...data, confianca: calculateInitialConfidence(data) }));
});

// Todo o restante é exclusivo de operadores autenticados.
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(repository.findActive().filter((report) => isInsideServiceArea(report.latitude, report.longitude)));
});

router.post('/proxima', (req, res) => {
  const { latitude, longitude } = req.body;
  if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) {
    return res.status(400).json({ erro: 'Latitude ou longitude do atendente inválida.' });
  }
  if (!isInsideServiceArea(latitude, longitude)) {
    return res.status(400).json({ erro: 'A equipe deve estar no estado de São Paulo ou no norte do Paraná.' });
  }

  const eligible = repository.findPending().filter((report) => isInsideServiceArea(report.latitude, report.longitude));
  const classificacao = prioritizeReports(eligible, { latitude, longitude });
  const awaiting = repository.findAwaitingValidation().filter((report) => isInsideServiceArea(report.latitude, report.longitude));
  const classificacaoTriagem = prioritizeReports(awaiting, { latitude, longitude });
  return res.json({
    recomendada: classificacao[0] || null,
    triagem_recomendada: classificacaoTriagem[0] || null,
    total_pendentes: classificacao.length,
    classificacao,
    classificacao_triagem: classificacaoTriagem
  });
});

router.patch('/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const status = typeof req.body.status === 'string' ? req.body.status.toUpperCase() : '';
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ erro: `Status deve ser: ${VALID_STATUSES.join(', ')}.` });
  const current = repository.findById(id);
  if (!current) return res.status(404).json({ erro: 'Denúncia não encontrada.' });
  if (status === 'EM_ATENDIMENTO' && current.verificacao_status !== 'VALIDADA' && current.grau_urgencia !== 4) {
    return res.status(409).json({ erro: 'Valide a denúncia antes de iniciar o atendimento.' });
  }

  const updated = repository.updateStatus(id, status);
  return updated ? res.json(updated) : res.status(404).json({ erro: 'Denúncia não encontrada.' });
});

router.patch('/:id/verificacao', (req, res) => {
  const id = Number(req.params.id);
  const verificacaoStatus = typeof req.body.status === 'string' ? req.body.status.toUpperCase() : '';
  const justificativa = typeof req.body.justificativa === 'string' ? req.body.justificativa.trim() : '';
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });
  if (!VALID_VERIFICATION_STATUSES.includes(verificacaoStatus)) return res.status(400).json({ erro: 'Verificação deve ser VALIDADA ou REJEITADA.' });
  if (verificacaoStatus === 'REJEITADA' && justificativa.length < 5) return res.status(400).json({ erro: 'Informe uma justificativa para rejeitar.' });
  const updated = repository.updateVerification(id, verificacaoStatus, justificativa);
  return updated ? res.json(updated) : res.status(404).json({ erro: 'Denúncia não encontrada.' });
});

router.patch('/:id/contato-status', (req, res) => {
  const id = Number(req.params.id);
  const status = typeof req.body.status === 'string' ? req.body.status.toUpperCase() : '';
  const validStatuses = ['NAO_CONTATADO', 'CONTATADO', 'SEM_RESPOSTA'];
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });
  if (!validStatuses.includes(status)) return res.status(400).json({ erro: 'Status de contato inválido.' });
  const updated = repository.updateContactStatus(id, status, req.user.id);
  return updated ? res.json(updated) : res.status(404).json({ erro: 'Denúncia não encontrada.' });
});

module.exports = router;
