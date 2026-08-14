const { findSession } = require('../services/authService');

function readBearer(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function requireAuth(req, res, next) {
  const user = findSession(readBearer(req));
  if (!user) return res.status(401).json({ erro: 'Acesso restrito à Central de Atendimento.' });
  req.user = user;
  return next();
}

module.exports = { requireAuth, readBearer };
