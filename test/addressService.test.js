const test = require('node:test');
const assert = require('node:assert/strict');
const { createAddressSearch } = require('../src/services/addressService');
const { isInsideServiceArea } = require('../src/utils/serviceArea');
const feature = (coordinates = [-49.87, -22.98], properties = {}) => ({
  geometry: { type: 'Point', coordinates },
  properties: { street: 'Rua Paraná', housenumber: '120', city: 'Ourinhos', state: 'São Paulo', countrycode: 'BR', ...properties }
});

test('encontra a Rua Henrique Setti em Jacarezinho no índice local, sem rede', async () => {
  let calls = 0;
  const search = createAddressSearch({ fetchImpl: async () => { calls++; throw new Error('Offline'); } });
  const results = await search('r. henrique seti, centro, jacarezinho - PR');
  assert.equal(results.length, 1);
  assert.match(results[0].endereco, /^Rua Henrique Setti · Centro · Jacarezinho/);
  assert.equal(results[0].fonte, 'IBGE');
  assert.equal(calls, 0);
  await assert.rejects(search('Rua Henrique Setti, Ourinhos'), { status: 502 });
  assert.equal(calls, 1);
});

test('localiza logradouros pelo nome, aceita municípios de PR e SP e distingue cidades homônimas', async () => {
  const search = createAddressSearch({ fetchImpl: async () => { assert.fail('A busca local não precisa do Photon.'); } });
  const examples = [
    ['Rua Henrique Setti', /Rua Henrique Setti.*Jacarezinho/],
    ['rua henrique setttti', /Rua Henrique Setti.*Jacarezinho/],
    ['Av. Higienópolis, Londrina - PR', /Avenida Higienopolis.*Londrina/],
    ['Av. Rui Barbosa, Assis - SP', /Avenida Rui Barbosa.*Assis/],
    ['Rua 10, Jacarezinho', /Rua 10.*Jacarezinho/]
  ];
  for (const [query, expected] of examples) {
    const results = await search(query);
    assert.ok(results.length);
    for (const result of results) {
      assert.match(result.endereco, expected);
      assert.equal(result.fonte, 'IBGE');
      assert.ok(isInsideServiceArea(result.latitude, result.longitude));
    }
  }
  const sameStreet = await search('Rua Paraná');
  assert.equal(new Set(sameStreet.map(({ endereco }) => endereco.split(' · ').at(-2))).size, sameStreet.length);
});

test('busca com número conserva a sugestão do provedor quando disponível', async () => {
  const search = createAddressSearch({ fetchImpl: async () => ({ ok: true, json: async () => ({ features: [
    feature([-49.97, -23.15], { street: 'Rua Henrique Setti', city: 'Jacarezinho', state: 'Paraná' })
  ] }) }) });
  const [result] = await search('Rua Henrique Setti, 120, Jacarezinho - PR');
  assert.match(result.endereco, /^Rua Henrique Setti, 120 · Jacarezinho/);
  assert.equal(result.fonte, undefined);
});

test('busca com número usa o índice local quando o provedor falha ou sugere outra rua', async () => {
  const query = 'Rua Henrique Setti 120 Jacarezinho PR';
  const offline = createAddressSearch({ fetchImpl: async () => { throw new Error('Offline'); } });
  assert.equal((await offline(query))[0].fonte, 'IBGE');

  let calls = 0;
  const unrelated = createAddressSearch({ fetchImpl: async () => {
    calls++;
    return { ok: true, json: async () => ({ features: [
      feature([-49.97, -23.15], { street: 'Rua Francisco Henrique dos Santos', city: 'Jacarezinho', osm_key: 'highway' }),
      feature([-49.97, -23.15], { street: 'Rua Henrique Setti', city: 'Jacarezinho', housenumber: '240' })
    ] }) };
  } });
  const results = await unrelated(query);
  assert.equal(results[0].fonte, 'IBGE');
  assert.deepEqual(await unrelated(query), results);
  assert.equal(calls, 1);
});

test('busca mantém somente endereços válidos na área atendida, deduplica e respeita cache', async () => {
  let calls = 0, clock = 10000;
  const search = createAddressSearch({ now: () => clock, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url.searchParams.get('bbox'), '-51.35,-24.55,-48.55,-22.25');
    assert.equal(url.searchParams.get('q'), 'Rua Paraná 120 Ourinhos');
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ features: [feature(), feature(), feature([-49.871, -22.981]), feature([-51, -30]), feature([null, null]), feature([-49.8, -23], { countrycode: 'AR' })] }) };
  } });
  const first = await search('  Rua Paraná   120 Ourinhos ');
  assert.equal(first.length, 1);
  assert.equal(first[0].endereco, 'Rua Paraná, 120 · Ourinhos · São Paulo');
  assert.equal(first[0].latitude, -22.98);
  assert.equal(first[0].longitude, -49.87);
  assert.deepEqual(await search('rua paraná 120 ourinhos'), first);
  assert.equal(calls, 1);
  await assert.rejects(search('Outro endereço'), { status: 429 });
  clock += 86400001;
  await search('Rua Paraná 120 Ourinhos');
  assert.equal(calls, 2);
});

test('consultas simultâneas iguais compartilham a chamada; consultas diferentes aguardam', async () => {
  let complete, calls = 0;
  const search = createAddressSearch({ fetchImpl: async () => {
    calls++;
    await new Promise((resolve) => { complete = resolve; });
    return { ok: true, json: async () => ({ features: [] }) };
  } });
  const first = search('Rua Nome Inexistente, Ourinhos');
  const second = search('Rua Nome Inexistente, Ourinhos');
  await assert.rejects(search('Rua Outro Nome Inexistente, Ourinhos'), { status: 429 });
  complete();
  assert.deepEqual(await first, []);
  assert.deepEqual(await second, []);
  assert.equal(calls, 1);
});

test('falha e resposta inválida permitem nova tentativa; entradas inválidas não consultam provedor', async () => {
  let clock = 0, calls = 0;
  const search = createAddressSearch({ now: () => clock, fetchImpl: () => {
    calls++;
    if (calls === 1) throw new Error('Offline');
    return Promise.resolve({ ok: true, json: async () => ({ features: [] }) });
  } });
  for (const value of [undefined, ['a', 'b'], 'ab', 'a'.repeat(301)]) await assert.rejects(search(value), { status: 400 });
  assert.equal(calls, 0);
  await assert.rejects(search('Rua Nome Inexistente, Ourinhos'), { status: 502 });
  clock += 2000;
  assert.deepEqual(await search('Rua Nome Inexistente, Ourinhos'), []);
  const malformed = createAddressSearch({ fetchImpl: async () => ({ ok: true, json: async () => ({ erro: 'Formato incorreto' }) }) });
  await assert.rejects(malformed('Rua Nome Inexistente, Ourinhos'), { status: 502 });
});

test('prioriza Jacarezinho quando a Rua Primeiro de Maio é buscada com o mapa aproximado', async () => {
  const search = createAddressSearch({ fetchImpl: async () => { throw new Error('Offline'); } });
  const screenshotBounds = [-49.967, -23.165, -49.957, -23.155];
  const [nearby] = await search('Rua Primeiro de Maio', screenshotBounds);
  assert.match(nearby.endereco, /^Rua Primeiro de Maio · .*Jacarezinho/);

  const [explicit] = await search('Rua Primeiro de Maio, Bauru - SP', screenshotBounds);
  assert.match(explicit.endereco, /Bauru/);
});

test('usa a geometria da camada do mapa como sugestão, sem consulta online', async () => {
  const search = createAddressSearch({ fetchImpl: async () => { assert.fail('O trecho local deve ser usado sem rede.'); } });
  const bounds = [-49.9765, -23.1662, -49.973, -23.1636];
  for (const query of ['Rua Primeiro de Maio', 'Rua 1º de Maio', 'Rua Dois de Abril']) {
    const [result] = await search(query, bounds);
    assert.equal(result.no_mapa, true);
    assert.equal(result.fonte, 'IBGE');
    assert.match(result.endereco, /Jacarezinho/);
    assert(result.latitude >= bounds[1] && result.latitude <= bounds[3]);
    assert(result.longitude >= bounds[0] && result.longitude <= bounds[2]);
  }
});

test('procura ruas do mapa-base no fornecedor online com preferência pela área visível', async () => {
  const bounds = [-49.967, -23.165, -49.957, -23.155];
  const search = createAddressSearch({ fetchImpl: async (url) => {
    assert.equal(Number(url.searchParams.get('lat')).toFixed(2), '-23.16');
    assert.equal(Number(url.searchParams.get('lon')).toFixed(3), '-49.962');
    return { ok: true, json: async () => ({ features: [
      feature([-49.40, -23.2], {street:'Rua Teste de Mapa Externo', city:'Outra cidade', housenumber:undefined}),
      feature([-49.9624, -23.1600], {street:'Rua Teste de Mapa Externo', city:'Jacarezinho', housenumber:undefined})
    ] }) };
  }});
  const [result] = await search('Rua Teste de Mapa Externo', bounds);
  assert.match(result.endereco, /Jacarezinho/);
});
