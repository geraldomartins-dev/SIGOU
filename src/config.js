const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT_DIR, 'data', 'sigou.db');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  ROOT_DIR,
  DB_CLIENT: (process.env.DB_CLIENT || 'sqlite').toLowerCase(),
  DB_PATH,
  DATA_DIR: process.env.DATA_DIR || path.dirname(DB_PATH),
  ROUTING_ENABLED: process.env.ROUTING_ENABLED === 'true',
  OSRM_URL: process.env.OSRM_URL || 'https://router.project-osrm.org',
  NOMINATIM_URL: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
  GEOCODING_URL: process.env.GEOCODING_URL || 'https://photon.komoot.io',
  MYSQL: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sigou'
  }
};
