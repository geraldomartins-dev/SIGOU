const { MUNICIPALITIES } = require('./locationService');

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function parseAddressQuery(query, expectedCity) {
  const original = String(query || '').trim();
  const text = normalize(original);
  const pieces = original.split(/[,·]/).map((part) => part.trim()).filter(Boolean);
  const normalizedCity = (value) => normalize(value).replace(/ (?:pr|sp|parana|sao paulo)$/, '');
  const cityText = normalizedCity(text);
  const known = MUNICIPALITIES.find(([name]) => expectedCity
    ? normalize(name) === normalize(expectedCity)
    : pieces.length > 1
      ? pieces.slice(1).some((piece) => normalizedCity(piece) === normalize(name))
      : cityText.endsWith(` ${normalize(name)}`));
  let street = pieces[0] || original;
  let city = expectedCity || known?.[0] || '';
  if (!city && pieces.length > 1) {
    city = pieces.slice(1).find((part) => !/^\d+[a-z]?$/i.test(part) && !/^(PR|SP)$/i.test(part)) || '';
    city = city.replace(/\s*[-/]\s*(PR|SP)\s*$/i, '').trim();
  }
  if (city && pieces.length === 1 && cityText.endsWith(` ${normalize(city)}`)) {
    street = cityText.slice(0, -(normalize(city).length + 1));
  }
  const tokens = normalize(street).replace(/\b(rua|r|avenida|av|travessa|tv|alameda|praca|estrada|rodovia|de|da|do|dos|das|e)\b/g, ' ').split(/\s+/).filter(Boolean);
  // Números de imóvel ao final não fazem parte do nome da rua.
  if (tokens.length > 1 && /^\d+[a-z]?$/.test(tokens.at(-1))) tokens.pop();
  return { street, city, tokens, cityCenter: known ? { nome: known[0], latitude: known[2], longitude: known[3] } : null };
}

function closeWord(a, b) {
  const collapse = (word) => word.replace(/([a-z])\1+/g, '$1');
  a = collapse(a); b = collapse(b);
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}

function matchesAddress(properties, parsed) {
  const isStreet = properties.street || properties.osm_key === 'highway' || properties.type === 'street';
  if (!isStreet || !parsed.tokens.length) return false;
  if (parsed.city && normalize(properties.city || properties.county) !== normalize(parsed.city)) return false;
  const words = normalize(properties.street || properties.name).split(' ');
  return parsed.tokens.every((token) => words.some((word) => closeWord(token, word)));
}

module.exports = { normalize, parseAddressQuery, matchesAddress };
