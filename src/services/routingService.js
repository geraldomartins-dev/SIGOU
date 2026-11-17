const { OSRM_URL, ROUTING_ENABLED } = require('../config');

const coordinate = ({ latitude, longitude }) => `${Number(longitude)},${Number(latitude)}`;

async function roadMatrix(origin, destinations) {
  if (!ROUTING_ENABLED || !destinations.length) return null;
  try {
    const coordinates = [origin, ...destinations].map(coordinate).join(';');
    const destinationIndexes = destinations.map((_, index) => index + 1).join(';');
    const url = `${OSRM_URL}/table/v1/driving/${coordinates}?sources=0&destinations=${destinationIndexes}&annotations=distance,duration`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code !== 'Ok') return null;
    return destinations.map((_, index) => ({
      distancia_rota_km: data.distances?.[0]?.[index] == null ? null : data.distances[0][index] / 1000,
      tempo_viagem_min: data.durations?.[0]?.[index] == null ? null : data.durations[0][index] / 60
    }));
  } catch { return null; }
}

async function roadRoute(origin, destination) {
  if (!ROUTING_ENABLED) return null;
  try {
    const url = `${OSRM_URL}/route/v1/driving/${coordinate(origin)};${coordinate(destination)}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return null;
    return { distancia_rota_km: route.distance / 1000, tempo_viagem_min: route.duration / 60, geometria: route.geometry };
  } catch { return null; }
}

module.exports = { roadMatrix, roadRoute };
