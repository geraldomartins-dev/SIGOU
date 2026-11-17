const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAddressQuery, matchesAddress } = require('../src/services/addressMatching');

test('não confunde Henrique Seti com outras ruas de Jacarezinho', () => {
  const parsed = parseAddressQuery('rua henrique seti, jacarezinho - PR');
  assert.equal(parsed.city, 'Jacarezinho');
  assert.equal(parsed.cityCenter.nome, 'Jacarezinho');
  const candidate = (name, city = 'Jacarezinho') => ({ name, city, osm_key: 'highway' });
  assert.equal(matchesAddress(candidate('Rua Francisco Henrique dos Santos'), parsed), false);
  assert.equal(matchesAddress(candidate('Rua Sete de Setembro'), parsed), false);
  assert.equal(matchesAddress(candidate('Rua Augusto Faga'), parsed), false);
  assert.equal(matchesAddress(candidate('Rua Henrique Setti'), parsed), true);
  assert.equal(matchesAddress(candidate('Rua Henrique Setti', 'Ourinhos'), parsed), false);
});

test('ignora acentos, abreviação do tipo de via, número e pequenas diferenças de escrita', () => {
  assert.equal(matchesAddress({ street: 'Rua Paraná', city: 'Ourinhos' }, parseAddressQuery('R. Parana, 120, Ourinhos - SP')), true);
  assert.equal(matchesAddress({ street: 'Rua Henrique Setti', city: 'Jacarezinho' }, parseAddressQuery('Rua Henriqe Setti, Jacarezinho')), true);
  assert.equal(matchesAddress({ name: 'Rua Paraná', city: 'Ourinhos', type: 'street' }, parseAddressQuery('Rua Parana Ourinhos')), true);
  assert.equal(matchesAddress({ name: 'Colégio Luiz Setti', street: 'Rua Almirante Barroso', city: 'Jacarezinho' }, parseAddressQuery('Rua Henrique Setti, Jacarezinho')), false);
  assert.equal(matchesAddress({ name: 'Jacarezinho', city: 'Jacarezinho', type: 'city' }, parseAddressQuery('Rua Henrique Setti, Jacarezinho')), false);
});
