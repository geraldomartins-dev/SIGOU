const express = require('express');
const repository = require('../repositories/denunciaRepository');
const { buildDashboard } = require('../services/dashboardService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => req.user.papel === 'ADMIN' ? next() : res.status(403).json({ erro: 'Acesso exclusivo para administradores.' }));

router.get('/dashboard', async (req, res) => {
  const requested = Number(req.query.periodo || 30);
  const period = [1, 7, 30, 90, 365].includes(requested) ? requested : 30;
  res.set('Cache-Control', 'no-store');
  res.json(buildDashboard(await repository.findDashboardReports(), period));
});

module.exports = router;
