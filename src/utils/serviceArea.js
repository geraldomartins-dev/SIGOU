// Corredor regional aproximado: Norte Pioneiro do Paraná e região de Ourinhos/SP.
const SERVICE_AREAS = [
  { name: 'Norte Pioneiro e região de Ourinhos', minLat: -24.55, maxLat: -22.25, minLng: -51.35, maxLng: -48.55 }
];

function isInsideServiceArea(latitude, longitude) {
  return SERVICE_AREAS.some((area) => latitude >= area.minLat && latitude <= area.maxLat
    && longitude >= area.minLng && longitude <= area.maxLng);
}

module.exports = { SERVICE_AREAS, isInsideServiceArea };
