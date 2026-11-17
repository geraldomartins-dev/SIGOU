const path = require('node:path');
const express = require('express');
const denunciasRoutes = require('./routes/denuncias');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const addressRoutes = require('./routes/enderecos');
const trackingRoutes = require('./routes/acompanhamento');
const { ROOT_DIR, DATA_DIR } = require('./config');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(ROOT_DIR, 'public')));
  app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
  app.get('/api/health', async (req, res) => {
    try {
      const db = await require('./db').getDatabase();
      await db.get('SELECT 1 AS ok');
      res.json({ status: 'ok', app: 'sigou', pid: process.pid,
        instance: require('node:crypto').createHash('sha256').update(ROOT_DIR.toLowerCase()).digest('hex') });
    } catch {
      res.status(503).json({ status: 'error', app: 'sigou', message: 'Banco indisponivel' });
    }
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/denuncias', denunciasRoutes);
  app.use('/api/enderecos', addressRoutes);
  app.use('/api/acompanhamento', trackingRoutes.citizen);
  app.use('/api/conversas', trackingRoutes.central);
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
