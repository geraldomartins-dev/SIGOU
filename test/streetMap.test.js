const test = require('node:test');
const assert = require('node:assert/strict');
const { searchAddresses } = require('../src/services/addressService');
const { parseStreetBounds, getStreetMap } = require('../src/services/streetMap');

test('a busca e o mapa local encontram a Rua Henrique Setti em Jacarezinho', async () => {
  for (const query of ['Rua henrique setti', 'rua henrique setttti']) {
    const results = await searchAddresses(query);
    assert.ok(results.length);
    assert.ok(results.every(({ endereco }) => /^Rua Henrique Setti · .*Jacarezinho/.test(endereco)));
  }

  const { type, features } = getStreetMap(parseStreetBounds('-49.985,-23.17,-49.968,-23.157'));
  assert.equal(type, 'FeatureCollection');
  const street = features.find(({ properties }) => properties.nome === 'Rua Henrique Setti');
  assert.equal(street?.geometry.type, 'MultiLineString');
  assert.ok(street.geometry.coordinates.length > 1);
  assert.ok(street.geometry.coordinates.every((line) => line.length >= 2));

  assert.equal(parseStreetBounds('-51.35,-24.55,-48.55,-22.25'), null);
  assert.deepEqual(getStreetMap(parseStreetBounds('-46.65,-23.56,-46.64,-23.55')).features, []);
});
