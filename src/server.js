const { createApp } = require('./app');
const { getDatabase, closeDatabase } = require('./db');
const { PORT } = require('./config');

let server;
async function start() {
  await getDatabase();
  server = createApp().listen(PORT, () => console.log(`ResolveJá disponível em http://localhost:${PORT}`));
}
start().catch((error) => {
  console.error('Não foi possível iniciar o ResolveJá:', error.message);
  process.exit(1);
});

function shutdown() {
  if (!server) return closeDatabase().finally(() => process.exit(0));
  server.close(async () => { await closeDatabase(); process.exit(0); });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
