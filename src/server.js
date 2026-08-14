const { createApp } = require('./app');
const { getDatabase, closeDatabase } = require('./db');
const { PORT } = require('./config');

getDatabase();
const server = createApp().listen(PORT, () => {
  console.log(`SIGOU disponível em http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
