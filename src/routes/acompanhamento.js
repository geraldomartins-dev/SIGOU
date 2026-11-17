const express = require('express');
const { getDatabase } = require('../db');
const { readBearer, requireAuth } = require('../middleware/auth');
const repository = require('../repositories/acompanhamentoRepository');

const citizen = express.Router();
const central = express.Router();

function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

async function loadCitizenReport(req, res, next) {
  const key = readBearer(req);
  const report = /^[A-Za-z0-9_-]{32}$/.test(key) ? await repository.findByKey(key) : null;
  if (!report) return res.status(404).json({ erro: 'Link de acompanhamento inválido. Confira o link do comprovante.' });
  req.report = report;
  next();
}

async function loadCentralReport(req, res, next) {
  const id = Number(req.params.id);
  if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(id)) {
    return res.status(400).json({ erro: 'Informe um número de registro válido.' });
  }
  req.report = await repository.findReport(id);
  if (!req.report) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
  next();
}

async function showConversation(req, res) {
  res.json({ ocorrencia: req.report, mensagens: await repository.listMessages(req.report.id) });
}

function sendMessage(author) {
  return async (req, res) => {
    if (author === 'CENTRAL' && !req.report.tem_acesso) {
      return res.status(409).json({ erro: 'Gere o link de acompanhamento para abrir a conversa.' });
    }
    const text = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
    if (!text || text.length > 1000) {
      return res.status(400).json({ erro: 'Escreva uma mensagem de até 1.000 caracteres.' });
    }
    res.status(201).json(await repository.writeMessage(req.report.id, author, text));
  };
}

citizen.use(noStore, loadCitizenReport);
citizen.get('/', showConversation);
citizen.post('/mensagens', sendMessage('CIDADAO'));

central.use(noStore, requireAuth);
central.get('/', async (req, res) => res.json(await repository.findRecent()));
central.get('/:id', loadCentralReport, showConversation);
central.post('/:id/mensagens', loadCentralReport, sendMessage('CENTRAL'));
central.post('/:id/link', loadCentralReport, async (req, res) => {
  const { id, tem_acesso } = req.report;
  const alreadyActive = () => res.status(409).json({ erro: 'Esta ocorrência já tem um link de acompanhamento.' });
  if (tem_acesso) return alreadyActive();
  try {
    const key = await repository.createKey(await getDatabase(), id);
    res.status(201).json({ chave_acompanhamento: key });
  } catch (error) {
    if ((await repository.findReport(id))?.tem_acesso) return alreadyActive();
    throw error;
  }
});

module.exports = { citizen, central };
