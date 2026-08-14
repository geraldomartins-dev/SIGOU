const express = require('express');
const authService = require('../services/authService');
const { requireAuth, readBearer } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const usuario = typeof req.body.usuario === 'string' ? req.body.usuario.trim() : '';
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
  const result = authService.login(usuario, senha);
  return result ? res.json(result) : res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));
router.post('/logout', requireAuth, (req, res) => { authService.logout(readBearer(req)); res.status(204).end(); });

module.exports = router;
