const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineDistance } = require('../src/utils/haversine');
const { prioritizeReports, prioritizeWithTravel } = require('../src/services/priorityService');

test('Haversine retorna aproximadamente 111,2 km para um grau no Equador', () => {
  assert.ok(Math.abs(haversineDistance(0, 0, 0, 1) - 111.2) < 0.1);
});

test('priorização ordena pelo maior score e marca somente a primeira', () => {
  const now = new Date('2026-01-02T00:00:00Z');
  const reports = [
    { id: 1, grau_urgencia: 1, latitude: 0, longitude: 0, criado_em: '2026-01-01T23:00:00Z' },
    { id: 2, grau_urgencia: 4, latitude: 0, longitude: 0.01, criado_em: '2026-01-01T23:00:00Z' }
  ];
  const result = prioritizeReports(reports, { latitude: 0, longitude: 0 }, now);
  assert.equal(result[0].id, 2);
  assert.equal(result[0].recomendada, true);
  assert.equal(result[1].recomendada, false);
});

test('priorização por ruas considera o tempo estimado de viagem', () => {
  const reports = [
    { id: 1, grau_urgencia: 2, latitude: -23.1, longitude: -49.8, criado_em: new Date().toISOString() },
    { id: 2, grau_urgencia: 2, latitude: -23.2, longitude: -49.9, criado_em: new Date().toISOString() }
  ];
  const result = prioritizeWithTravel(reports, { latitude: -23, longitude: -49.7 }, [
    { distancia_rota_km: 20, tempo_viagem_min: 40 }, { distancia_rota_km: 12, tempo_viagem_min: 10 }
  ]);
  assert.equal(result[0].id, 2);
  assert.equal(result[0].rota_real, true);
});

test('rota aceita viagem de zero minutos e usa Haversine para métricas incompletas', () => {
  const reports = [{ id: 1, grau_urgencia: 2, latitude: -23, longitude: -49.7, criado_em: new Date().toISOString() }];
  const origin = { latitude: -23, longitude: -49.7 };
  assert.equal(prioritizeWithTravel(reports, origin, [{ distancia_rota_km: 0, tempo_viagem_min: 0 }])[0].rota_real, true);
  assert.equal(prioritizeWithTravel(reports, origin, [{ distancia_rota_km: null, tempo_viagem_min: 10 }])[0].rota_real, false);
});
