const urgencyLabels = { 1: 'Baixa', 2: 'Média', 3: 'Alta', 4: 'Crítica' };
const timeZone = 'America/Sao_Paulo';
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
function dayKey(date) {
  const parts = Object.fromEntries(calendar.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
// SQLite CURRENT_TIMESTAMP e os Date do adaptador MySQL usam UTC.
function timestamp(value) {
  if (value == null || value === '') return NaN;
  if (value instanceof Date) return value.getTime();
  const text = String(value).trim();
  return Date.parse(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(text) ? `${text.replace(' ', 'T')}Z` : text);
}
function groupCount(rows, key, fallback = 'Não identificada') {
  const counts = new Map();
  rows.forEach((row) => counts.set(row[key] || fallback, (counts.get(row[key] || fallback) || 0) + 1));
  return [...counts.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}
function buildDashboard(rows, periodDays = 30, now = new Date()) {
  const period = [1, 7, 30, 90, 365].includes(Number(periodDays)) ? Number(periodDays) : 30;
  const end = timestamp(now);
  const today = dayKey(new Date(end));
  const startDay = new Date(`${today}T12:00:00Z`);
  startDay.setUTCDate(startDay.getUTCDate() - period + 1);
  const first = dayKey(startDay);
  const inPeriod = (value) => {
    const time = timestamp(value);
    return Number.isFinite(time) && time <= end && dayKey(new Date(time)) >= first;
  };
  const eligible = rows.filter((row) => row.verificacao_status !== 'REJEITADA');
  const opened = eligible.filter((row) => inPeriod(row.criado_em));
  const completed = eligible.filter((row) => row.status === 'CONCLUIDA' && inPeriod(row.concluido_em));
  const active = eligible.filter((row) => ['PENDENTE', 'EM_ATENDIMENTO'].includes(row.status));
  const pending = active.filter((row) => row.status === 'PENDENTE').length;
  const waiting = active.filter((row) => row.verificacao_status === 'AGUARDANDO_VALIDACAO').length;
  const urgencies = { 1: 0, 2: 0, 3: 0, 4: 0 };
  opened.forEach((row) => { if (row.grau_urgencia in urgencies) urgencies[row.grau_urgencia] += 1; });
  const serviceTimes = completed.map((row) => ({ start: timestamp(row.atendimento_iniciado_em), end: timestamp(row.concluido_em) }))
    .filter(({ start, end: finish }) => Number.isFinite(start) && finish >= start)
    .map(({ start, end: finish }) => (finish - start) / 3_600_000);
  const cities = groupCount(opened, 'cidade').map((city) => {
    const located = opened.filter((row) => (row.cidade || 'Não identificada') === city.nome &&
      row.latitude != null && row.longitude != null && row.latitude !== '' && row.longitude !== '' &&
      Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)) &&
      Math.abs(Number(row.latitude)) <= 90 && Math.abs(Number(row.longitude)) <= 180);
    return { ...city, latitude: located.length ? located.reduce((sum, row) => sum + Number(row.latitude), 0) / located.length : null,
      longitude: located.length ? located.reduce((sum, row) => sum + Number(row.longitude), 0) / located.length : null };
  });
  const days = Array.from({ length: period }, (_, index) => {
    const date = new Date(startDay);
    date.setUTCDate(date.getUTCDate() + index);
    return { data: dayKey(date), abertas: 0, concluidas: 0 };
  });
  const byDay = new Map(days.map((day) => [day.data, day]));
  opened.forEach((row) => byDay.get(dayKey(new Date(timestamp(row.criado_em)))).abertas++);
  completed.forEach((row) => byDay.get(dayKey(new Date(timestamp(row.concluido_em)))).concluidas++);
  return {
    periodo_dias: period,
    periodo: { inicio: first, fim: today, fuso: timeZone },
    atualizado_em: new Date(end).toISOString(),
    resumo: { total: opened.length, pendentes: pending, em_atendimento: active.length - pending,
      concluidas: completed.length, atendimentos_com_tempo: serviceTimes.length,
      tempo_medio_horas: serviceTimes.length ? serviceTimes.reduce((a, b) => a + b, 0) / serviceTimes.length : null },
    fila: { total: active.length, aguardando_validacao: waiting,
      urgentes: active.filter((row) => Number(row.grau_urgencia) >= 3).length },
    por_status: [{ nome: 'PENDENTE', total: pending }, { nome: 'EM_ATENDIMENTO', total: active.length - pending }],
    por_urgencia: Object.entries(urgencies).map(([key, total]) => ({ nome: urgencyLabels[key], grau: Number(key), total })),
    por_cidade: cities,
    por_regiao: groupCount(opened, 'regiao'),
    evolucao: days,
    conclusoes_sem_data: eligible.filter((row) => row.status === 'CONCLUIDA' && !Number.isFinite(timestamp(row.concluido_em))).length,
    recentes: completed.sort((a, b) => timestamp(b.concluido_em) - timestamp(a.concluido_em)).slice(0, 8)
      .map(({ id, titulo, cidade, concluido_em, atendimento_iniciado_em }) => ({ id, titulo, cidade, concluido_em, atendimento_iniciado_em }))
  };
}
module.exports = { buildDashboard };
