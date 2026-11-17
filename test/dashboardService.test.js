const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDashboard } = require('../src/services/dashboardService');
const now = new Date('2026-10-28T17:00:00Z');
const base = { criado_em: '2026-10-28T13:00:00Z', grau_urgencia: 2, latitude: -23.2, longitude: -49.7, cidade: 'Ourinhos', regiao: 'SP', verificacao_status: 'VALIDADA' };

test('conclusão de chamado antigo entra em hoje, 7 e 30 dias pela data de conclusão', () => {
  const rows = [
    { ...base, id: 1, criado_em: '2026-10-01T10:00:00Z', status: 'CONCLUIDA', atendimento_iniciado_em: '2026-10-28T10:00:00Z', concluido_em: '2026-10-28T12:00:00Z' },
    { ...base, id: 2, criado_em: '2026-09-01T10:00:00Z', status: 'PENDENTE', verificacao_status: 'AGUARDANDO_VALIDACAO' },
    { ...base, id: 3, criado_em: '2026-09-02T10:00:00Z', status: 'EM_ATENDIMENTO', grau_urgencia: 4 }
  ];
  for (const period of [1, 7, 30]) {
    const result = buildDashboard(rows, period, now);
    assert.equal(result.resumo.concluidas, 1);
    assert.equal(result.resumo.tempo_medio_horas, 2);
    assert.equal(result.resumo.atendimentos_com_tempo, 1);
    assert.equal(result.resumo.total, period === 30 ? 1 : 0);
    assert.equal(result.resumo.pendentes, 1);
    assert.equal(result.resumo.em_atendimento, 1);
    assert.equal(result.fila.total, 2);
    assert.equal(result.fila.aguardando_validacao, 1);
    assert.equal(result.fila.urgentes, 1);
    assert.equal(result.evolucao.at(-1).concluidas, 1);
    assert.equal(result.recentes[0].id, 1);
  }
});

test('período inclui dias completos em Brasília, limita futuro e interpreta SQL UTC', () => {
  const values = ['2026-10-22 02:59:59', '2026-10-22 03:00:00', '2026-10-28T03:00:00Z', '2026-10-28T18:00:00Z', 'inválida', null];
  const rows = values.map((criado_em) => ({ ...base, criado_em, status: 'PENDENTE' }));
  const result = buildDashboard(rows, 7, now);
  assert.equal(result.resumo.total, 2);
  assert.equal(result.periodo.inicio, '2026-10-22');
  assert.equal(result.evolucao.length, 7);
  assert.equal(result.evolucao[0].abertas, 1);
  assert.equal(buildDashboard(rows, 1, now).resumo.total, 1);
  assert.equal(buildDashboard(rows, 999, now).periodo_dias, 30);
  const midnight = buildDashboard([{ ...base, criado_em: '2026-10-29 02:00:00', status: 'PENDENTE' }], 1, new Date('2026-10-29T02:30:00Z'));
  assert.equal(midnight.periodo.fim, '2026-10-28');
  assert.equal(midnight.resumo.total, 1);
});

test('tempo médio usa conclusões do período com duração válida; rejeitados não entram', () => {
  const rows = [
    { ...base, status: 'CONCLUIDA', atendimento_iniciado_em: '2026-10-28 10:00:00', concluido_em: '2026-10-28 12:00:00' },
    { ...base, status: 'CONCLUIDA', atendimento_iniciado_em: '2026-10-28 12:00:00', concluido_em: '2026-10-28 11:00:00' },
    { ...base, status: 'CONCLUIDA', atendimento_iniciado_em: null, concluido_em: '2026-10-28 12:00:00' },
    { ...base, status: 'CONCLUIDA', atendimento_iniciado_em: 'inválido', concluido_em: '2026-10-28 12:00:00' },
    { ...base, status: 'CONCLUIDA', concluido_em: null },
    { ...base, status: 'CONCLUIDA', concluido_em: '2026-10-20 12:00:00' },
    { ...base, status: 'CONCLUIDA', verificacao_status: 'REJEITADA', concluido_em: '2026-10-28 12:00:00' }
  ];
  const result = buildDashboard(rows, 7, now);
  assert.equal(result.resumo.total, 6);
  assert.equal(result.resumo.concluidas, 4);
  assert.equal(result.resumo.atendimentos_com_tempo, 1);
  assert.equal(result.resumo.tempo_medio_horas, 2);
  assert.equal(result.conclusoes_sem_data, 1);
  assert.equal(result.por_cidade[0].total, 6);
});

test('sem dados não inventa tempo ou coordenadas e mantém totais consistentes', () => {
  const empty = buildDashboard([], 7, now);
  assert.equal(empty.resumo.tempo_medio_horas, null);
  assert.equal(empty.resumo.atendimentos_com_tempo, 0);
  assert.equal(empty.fila.total, 0);
  assert.equal(empty.evolucao.reduce((n, d) => n + d.abertas + d.concluidas, 0), 0);
  const result = buildDashboard([{ ...base, status: 'PENDENTE', latitude: null, longitude: null }], 7, now);
  assert.equal(result.por_cidade[0].latitude, null);
  assert.equal(result.por_cidade[0].longitude, null);
  assert.equal(result.por_urgencia.reduce((n, d) => n + d.total, 0), result.resumo.total);
});
