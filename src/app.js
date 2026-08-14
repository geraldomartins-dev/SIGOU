const path = require('node:path');
const express = require('express');
const denunciasRoutes = require('./routes/denuncias');
const authRoutes = require('./routes/auth');
const { ROOT_DIR } = require('./config');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(ROOT_DIR, 'public')));
  app.use('/uploads', express.static(path.join(ROOT_DIR, 'data', 'uploads')));
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/denuncias', denunciasRoutes);
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
