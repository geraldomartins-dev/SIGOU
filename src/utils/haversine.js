const EARTH_RADIUS_KM = 6371.0088;

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/** Retorna a distância do arco entre dois pontos da Terra, em quilômetros. */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const deltaLat = degreesToRadians(lat2 - lat1);
  const deltaLng = degreesToRadians(lng2 - lng1);
  const originLat = degreesToRadians(lat1);
  const destinationLat = degreesToRadians(lat2);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

module.exports = { haversineDistance };
