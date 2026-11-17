const { haversineDistance } = require('../utils/haversine');

const MUNICIPALITIES = [
  ['Ourinhos', 'Sul de São Paulo', -22.9797, -49.8706], ['Assis', 'Sul de São Paulo', -22.6617, -50.4122],
  ['Avaré', 'Sul de São Paulo', -23.1067, -48.9251], ['Santa Cruz do Rio Pardo', 'Sul de São Paulo', -22.8988, -49.6327],
  ['Chavantes', 'Sul de São Paulo', -23.0366, -49.7096], ['Ipaussu', 'Sul de São Paulo', -23.0575, -49.6279],
  ['Jacarezinho', 'Norte Pioneiro do Paraná', -23.1591, -49.9739], ['Cambará', 'Norte Pioneiro do Paraná', -23.0423, -50.0753],
  ['Santo Antônio da Platina', 'Norte Pioneiro do Paraná', -23.2953, -50.0773], ['Bandeirantes', 'Norte Pioneiro do Paraná', -23.1078, -50.3704],
  ['Cornélio Procópio', 'Norte Pioneiro do Paraná', -23.1813, -50.6466], ['Ibaiti', 'Norte Pioneiro do Paraná', -23.8486, -50.1873],
  ['Wenceslau Braz', 'Norte Pioneiro do Paraná', -23.8742, -49.8032], ['Siqueira Campos', 'Norte Pioneiro do Paraná', -23.6875, -49.8331]
];

function fallbackRegion(latitude) {
  return latitude <= -23.0 ? 'Norte Pioneiro do Paraná' : 'Sul de São Paulo';
}

async function identifyLocation(latitude, longitude) {
  const nearest = MUNICIPALITIES.map(([cidade, regiao, lat, lng]) => ({
    cidade, regiao, distance: haversineDistance(latitude, longitude, lat, lng)
  })).sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.distance > 55) return { cidade: 'Outra localidade', regiao: fallbackRegion(latitude) };
  return { cidade: nearest.cidade, regiao: nearest.regiao };
}

module.exports = { identifyLocation, fallbackRegion, MUNICIPALITIES };
