const { GEOCODING_URL } = require('../config');
const { isInsideServiceArea } = require('../utils/serviceArea');
const { parseAddressQuery, matchesAddress, normalize } = require('./addressMatching');
const { findMappedStreet, mapCenter } = require('./mappedStreetSearch');
const { haversineDistance } = require('../utils/haversine');
const { findLocalStreets, numberKey } = require('./localStreets');

const GEOCODING_TIMEOUT_MS = 20_000;

function withinBounds({ latitude, longitude }, [west, south, east, north]) {
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

function mergeSuggestions(first, others) {
  const identity = (result) => {
    const parts = result.endereco.split(' · ');
    return normalize(parts[0] + ' ' + (parts.length > 2 ? parts.at(-2) : ''));
  };
  const seen = new Set();
  return [...first, ...others].filter((result) => {
    const key = identity(result);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}
const failure = (message, status) => Object.assign(new Error(message), { status });

function createAddressSearch({ fetchImpl = fetch, now = Date.now, baseUrl = GEOCODING_URL } = {}) {
  const cache = new Map();
  let pending = null, lastRequest = -Infinity;
  return async function search(query, bounds) {
    if (typeof query !== 'string' || query.trim().length < 3 || query.trim().length > 300) {
      throw failure('Informe o nome da rua, com 3 a 300 caracteres.', 400);
    }
    const text = query.trim().replace(/\s+/g, ' ');
    const reference = bounds && mapCenter(bounds);
    const local = findLocalStreets(text, reference);
    const parsed = parseAddressQuery(text, local?.city);
    const mapped = bounds && await findMappedStreet(parsed, bounds, text);
    const fallback = mapped ? mergeSuggestions([mapped], local?.results || []) : local?.results || [];
    if (mapped && !local?.houseNumber) return fallback;
    if (local && !local.houseNumber && (!bounds || parsed.city || local.results.some(result => withinBounds(result, bounds)))) return fallback;
    const key = text.toLocaleLowerCase('pt-BR') + (bounds ? '|' + bounds.map(value => value.toFixed(4)).join(',') : '');
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.results;
    if (pending?.key === key) return pending.promise;
    if (pending || now() - lastRequest < 1100) {
      if (fallback.length) return fallback;
      throw failure('Aguarde um instante e tente buscar novamente.', 429);
    }
    lastRequest = now();
    const promise = (async () => {
      try {
        const url = new URL('api/', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
        url.search = new URLSearchParams({ q: text, limit: '15', bbox: '-51.35,-24.55,-48.55,-22.25' });
        if (reference) {
          url.searchParams.set('lat', reference.latitude);
          url.searchParams.set('lon', reference.longitude);
          url.searchParams.set('zoom', '16');
        }
        const response = await fetchImpl(url, {
          headers: { 'User-Agent': 'SIGOU/0.9 (urban occurrence location search)', Accept: 'application/json' },
          signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS)
        });
        if (!response.ok) throw new Error('Geocoder indisponível');
        const body = await response.json();
        if (!Array.isArray(body.features)) throw new Error('Resposta inválida');
        const seen = new Set();
        const results = body.features.flatMap((feature) => {
          const coordinates = feature.geometry?.coordinates;
          if (!Array.isArray(coordinates) || feature.geometry.type !== 'Point') return [];
          const [longitude, latitude] = coordinates;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isInsideServiceArea(latitude, longitude)) return [];
          const p = feature.properties || {};
          if (!matchesAddress(p, parsed)) return [];
          if (local?.houseNumber && numberKey(p.housenumber) !== local.houseNumber) return [];
          if (p.countrycode && p.countrycode.toUpperCase() !== 'BR') return [];
          const street = [p.street || p.name, p.housenumber].filter(Boolean).join(', ');
          const label = [...new Set([street, p.district, p.city || p.county, p.state].filter(Boolean))].join(' · ').slice(0, 300);
          const identity = label.toLocaleLowerCase('pt-BR');
          if (!label || seen.has(identity)) return [];
          seen.add(identity);
          return [{ endereco: label, latitude, longitude }];
        });
        if (reference) {
          const distance = (result) => haversineDistance(reference.latitude, reference.longitude, result.latitude, result.longitude);
          results.sort((a, b) => distance(a) - distance(b));
        }
        const visible = bounds && results.filter(result => withinBounds(result, bounds));
        let suggestions = results.length ? results.slice(0, 5) : fallback;
        if (fallback.length && !local?.houseNumber) suggestions = mergeSuggestions(visible || [], fallback);
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(key, { results: suggestions, expires: now() + 86_400_000 });
        return suggestions;
      } catch {
        if (fallback.length) return fallback;
        throw failure('A busca de endereços está indisponível. Tente novamente ou marque o local diretamente no mapa.', 502);
      }
    })();
    pending = { key, promise };
    try { return await promise; }
    finally { if (pending?.promise === promise) pending = null; }
  };
}

module.exports = { createAddressSearch, searchAddresses: createAddressSearch() };
