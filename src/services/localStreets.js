const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { gunzipSync } = require('node:zlib');
const { normalize } = require('./addressMatching');
const { haversineDistance } = require('../utils/haversine');
const { isInsideServiceArea } = require('../utils/serviceArea');

const TYPE_ABBREVIATIONS = { r: 'rua', av: 'avenida', al: 'alameda', tv: 'travessa', estr: 'estrada', rod: 'rodovia' };
const STATE_CODES = { parana: 'PR', pr: 'PR', 'sao paulo': 'SP', sp: 'SP' };
const STATE_NAMES = { PR: 'Paraná', SP: 'São Paulo' };
const HOUSE_NUMBER = / (?:\d+[a-z]?|s n|sn)$/;
const NUMBER_DETAIL = /^(?:\d+\s*[a-z]?|s n|sn)$/;
const numberKey = (value) => normalize(value).replace(/\s/g, '');
const CONNECTIVES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
const foldRepeatedLetters = (name) => name.replace(/([a-z])\1+/g, '$1');
const streetName = (words) => words.filter((word, index) =>
  index === 0 || index === words.length - 1 || !CONNECTIVES.has(word)).join(' ');

const streets = new Map();
const municipalities = new Map();
const streetTypes = new Set();
let longestCityName = 0;
const catalog = JSON.parse(gunzipSync(readFileSync(join(__dirname, '../data/logradouros-cnefe.json.gz'))).toString('utf8'));
for (const [code, city, uf, records] of catalog) {
  const cityName = normalize(city);
  longestCityName = Math.max(longestCityName, cityName.split(' ').length);
  const sameName = municipalities.get(cityName) || [];
  sameName.push({ code, city, uf });
  municipalities.set(cityName, sameName);

  for (const [street, district, latitude, longitude] of records) {
    if (!isInsideServiceArea(latitude, longitude)) continue;
    const [type, ...words] = normalize(street).split(' ');
    const name = streetName(words);
    const folded = foldRepeatedLetters(name);
    const endereco = [street, district, city, STATE_NAMES[uf] || uf].filter(Boolean).join(' · ');
    const entries = streets.get(folded) || [];
    entries.push({ type, name, code, district: normalize(district), result: { endereco, latitude, longitude, fonte: 'IBGE' } });
    streets.set(folded, entries);
    streetTypes.add(type);
  }
}

function cityAtEnd(query) {
  const words = [...query.matchAll(/[\p{L}\p{M}\p{N}]+/gu)];
  const tokens = words.map(([word]) => normalize(word));
  const lastTwo = tokens.slice(-2).join(' ');
  const uf = STATE_CODES[lastTwo] || STATE_CODES[tokens.at(-1)];
  const end = tokens.length - (STATE_CODES[lastTwo] ? 2 : uf ? 1 : 0);
  for (let length = Math.min(longestCityName, end - 1); length > 0; length--) {
    const sameName = municipalities.get(tokens.slice(end - length, end).join(' '));
    if (!sameName) continue;
    const matching = uf ? sameName.filter((city) => city.uf === uf) : sameName;
    return {
      municipality: matching.length === 1 ? matching[0] : null,
      street: query.slice(0, words[end - length].index),
      explicit: Boolean(uf) || /[,·]/.test(query)
    };
  }
  return null;
}

function prioritizeDifferentCities(matches) {
  const byCity = new Map();
  const otherDistricts = [];
  for (const match of matches) {
    if (byCity.has(match.code)) otherDistricts.push(match);
    else byCity.set(match.code, match);
  }
  return [...byCity.values(), ...otherDistricts];
}

function searchStreet(query, code, reference) {
  const [street, ...details] = query.split(/[,·]/);
  const normalizedDetails = details.map(normalize).filter(Boolean);
  if (!code && normalizedDetails.some((detail) => !NUMBER_DETAIL.test(detail))) return null;
  const [first, ...words] = normalize(street).split(' ');
  const type = TYPE_ABBREVIATIONS[first] || first;
  const hasType = streetTypes.has(type);
  const name = streetName(hasType ? words : [first, ...words]);
  if (!name) return null;
  const matches = (value) => {
    const candidates = (streets.get(foldRepeatedLetters(value)) || []).filter((record) =>
      (!code || record.code === code) && (!hasType || record.type === type));
    const exact = candidates.filter((record) => record.name === value);
    return exact.length ? exact : candidates;
  };

  let found = matches(name);
  let houseNumber = normalizedDetails.find((detail) => /^\d/.test(detail) && NUMBER_DETAIL.test(detail));
  const withoutNumber = name.replace(HOUSE_NUMBER, '');
  if (!found.length && withoutNumber !== name) {
    found = matches(withoutNumber);
    const suffix = name.slice(withoutNumber.length).trim();
    if (/^\d/.test(suffix)) houseNumber = suffix;
  }
  if (!found.length) return null;

  const preferred = found.filter((record) => normalizedDetails.includes(record.district));
  const candidates = preferred.length && code ? preferred : found;
  if (reference) {
    const distance = ({ result }) => haversineDistance(reference.latitude, reference.longitude, result.latitude, result.longitude);
    candidates.sort((a, b) => distance(a) - distance(b));
  }
  const ordered = code ? candidates : prioritizeDifferentCities(candidates);
  return { results: ordered.slice(0, 5).map((record) => record.result), houseNumber: code && houseNumber ? numberKey(houseNumber) : null };
}

function findLocalStreets(query, reference) {
  const city = cityAtEnd(query);
  if (city) {
    const local = city.municipality ? searchStreet(city.street, city.municipality.code, reference) : null;
    if (local) return { ...local, city: city.municipality.city };
    if (city.explicit) return null;
  }
  return searchStreet(query, null, reference);
}

module.exports = { findLocalStreets, numberKey };
