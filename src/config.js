const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  ROOT_DIR,
  DB_PATH: process.env.DB_PATH || path.join(ROOT_DIR, 'data', 'sigou.db')
};
