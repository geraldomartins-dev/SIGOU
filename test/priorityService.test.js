const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineDistance } = require('../src/utils/haversine');
const { prioritizeReports } = require('../src/services/priorityService');

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
