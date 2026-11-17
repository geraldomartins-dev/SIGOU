const express = require('express');
const { searchAddresses } = require('../services/addressService');
const { parseAddressQuery } = require('../services/addressMatching');
const { parseStreetBounds, getStreetMap } = require('../services/streetMap');
const router = express.Router();

router.get('/trechos', (req, res) => {
  const bounds = parseStreetBounds(req.query.bbox);
  if (!bounds) return res.status(400).json({ erro: 'Aproxime o mapa para consultar os trechos das ruas.' });
  res.set('Cache-Control', 'public, max-age=86400').json(getStreetMap(bounds));
});

router.get('/', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const bounds = parseStreetBounds(req.query.bbox);
    const resultados = await searchAddresses(req.query.busca, bounds);
    res.json({ resultados, cidade_aproximada: resultados.length ? null : parseAddressQuery(req.query.busca).cityCenter });
  } catch (error) {
    if (error.status === 429) res.set('Retry-After', '2');
    res.status(error.status || 502).json({ erro: error.message });
  }
});

module.exports = router;
