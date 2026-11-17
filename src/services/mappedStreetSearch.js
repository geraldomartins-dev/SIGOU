const { normalize } = require('./addressMatching');
const { getStreetMap } = require('./streetMap');
const { identifyLocation } = require('./locationService');
const { isInsideServiceArea } = require('../utils/serviceArea');

const abbreviations = { r: 'rua', av: 'avenida', tv: 'travessa', al: 'alameda', pr: 'praca', estr: 'estrada', rod: 'rodovia' };
const types = new Set([...Object.values(abbreviations), 'viela', 'via', 'largo', 'beco', 'passagem']);
const connectives = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
const streetKey = (name) => {
  const words = normalize(name).split(' ');
  words[0] = abbreviations[words[0]] || words[0];
  return words.join(' ')
    .replace(/\b1o?(?= (?:de )?(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b)/g, 'primeiro')
    .split(' ').filter(word => !connectives.has(word));
};

function closestPoint(start, end, bounds, center) {
  const [x, y] = start;
  const dx = end[0] - x, dy = end[1] - y;
  let low = 0, high = 1;
  for (const [origin, direction, min, max] of [[x, dx, bounds[0], bounds[2]], [y, dy, bounds[1], bounds[3]]]) {
    if (direction === 0) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const entry = (min - origin) / direction, exit = (max - origin) / direction;
    low = Math.max(low, Math.min(entry, exit));
    high = Math.min(high, Math.max(entry, exit));
    if (low > high) return null;
  }
  const weight = Math.cos(center.latitude * Math.PI / 180) ** 2;
  const length = dx * dx * weight + dy * dy;
  const projection = length ? ((center.longitude - x) * dx * weight + (center.latitude - y) * dy) / length : 0;
  const t = Math.max(low, Math.min(high, projection));
  const longitude = x + dx * t, latitude = y + dy * t;
  if (!isInsideServiceArea(latitude, longitude)) return null;
  return { latitude, longitude, distance: (center.longitude - longitude) ** 2 * weight + (center.latitude - latitude) ** 2 };
}

function mapCenter([west, south, east, north]) {
  return { latitude: (south + north) / 2, longitude: (west + east) / 2 };
}

function matchesStreet(text) {
  const query = streetKey(text);
  const hasType = types.has(query[0]);
  const last = query.at(-1);
  const withoutHouseNumber = query.length > (hasType ? 2 : 1) && /^[0-9]+[a-z]?$/.test(last)
    ? query.slice(0, -1).join(' ') : null;
  const fullName = query.join(' ');
  return (street) => {
    const words = streetKey(street);
    const comparable = (hasType || !types.has(words[0]) ? words : words.slice(1)).join(' ');
    return comparable === fullName || comparable === withoutHouseNumber;
  };
}

async function findMappedStreet(parsed, bounds, text) {
  const matchesLiteral = matchesStreet(text);
  const matchesParsed = matchesStreet(parsed.street);
  const center = mapCenter(bounds);
  let best;
  for (const feature of getStreetMap(bounds).features) {
    const street = feature.properties.nome;
    const literal = matchesLiteral(street);
    if (!literal && !matchesParsed(street)) continue;
    for (const line of feature.geometry.coordinates) {
      for (let i = 1; i < line.length; i++) {
        const point = closestPoint(line[i - 1], line[i], bounds, center);
        if (point && (!best || point.distance < best.distance)) best = { ...point, street, literal };
      }
    }
  }
  if (!best) return null;
  const { latitude, longitude } = best;
  const { cidade, regiao } = await identifyLocation(latitude, longitude);
  if (parsed.city && !best.literal && normalize(parsed.city) !== normalize(cidade)) return null;
  const state = regiao === 'Sul de São Paulo' ? 'São Paulo' : 'Paraná';
  const endereco = cidade === 'Outra localidade' ? best.street : [best.street, cidade, state].join(' · ');
  return { endereco, latitude, longitude, fonte: 'IBGE', no_mapa: true };
}

module.exports = { findMappedStreet, mapCenter };
