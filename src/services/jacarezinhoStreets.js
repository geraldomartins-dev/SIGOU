const records = require('../data/logradouros-jacarezinho.json');
const { normalize } = require('./addressMatching');
const { isInsideServiceArea } = require('../utils/serviceArea');

const CITY_SUFFIX = /(?:\s*[,·]\s*|\s+)jacarezinho(?:\s*[-/,·]?\s*(?:pr|paran[aá]))?\s*$/i;
const TYPE_ABBREVIATIONS = { r: 'rua', av: 'avenida', al: 'alameda', tv: 'travessa', estr: 'estrada', rod: 'rodovia' };
const HOUSE_NUMBER = / (?:\d+[a-z]?|s n|sn)$/;
const CONNECTIVES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
const foldRepeatedLetters = (name) => name.replace(/([a-z])\1+/g, '$1');
const streetName = (words) => words.filter((word, index) =>
  index === 0 || index === words.length - 1 || !CONNECTIVES.has(word)).join(' ');

const streets = records.filter(([, , latitude, longitude]) => isInsideServiceArea(latitude, longitude))
  .map(([street, district, latitude, longitude]) => {
    const [type, ...words] = normalize(street).split(' ');
    const name = streetName(words);
    const endereco = [street, district, 'Jacarezinho', 'Paraná'].filter(Boolean).join(' · ');
    return { type, name, folded: foldRepeatedLetters(name), district: normalize(district),
      result: { endereco, latitude, longitude, fonte: 'IBGE' } };
  });
const streetTypes = new Set(streets.map(({ type }) => type));

function findJacarezinhoStreets(query) {
  if (!CITY_SUFFIX.test(query)) return null;
  const [street, ...details] = query.replace(CITY_SUFFIX, '').split(/[,·]/);
  const [first, ...words] = normalize(street).split(' ');
  const type = TYPE_ABBREVIATIONS[first] || first;
  const hasType = streetTypes.has(type);
  const name = streetName(hasType ? words : [first, ...words]);
  if (!name) return null;
  const candidates = hasType ? streets.filter((record) => record.type === type) : streets;
  const matches = (value) => {
    const exact = candidates.filter((record) => record.name === value);
    if (exact.length) return exact;
    const folded = foldRepeatedLetters(value);
    return candidates.filter((record) => record.folded === folded);
  };

  let found = matches(name);
  let hasHouseNumber = details.some((part) => /^\d+[a-z]?\b/i.test(part.trim()));
  const withoutNumber = name.replace(HOUSE_NUMBER, '');
  if (!found.length && withoutNumber !== name) {
    found = matches(withoutNumber);
    hasHouseNumber = true;
  }
  if (!found.length) return null;

  const districts = details.map(normalize);
  const preferred = found.filter((record) => districts.includes(record.district));
  return { results: (preferred.length ? preferred : found).slice(0, 5).map((record) => record.result), hasHouseNumber };
}

module.exports = { findJacarezinhoStreets };
