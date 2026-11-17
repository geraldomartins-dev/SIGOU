const token = sessionStorage.getItem('sigou_token');
if (!token) location.replace('/login.html');
const $ = (selector) => document.querySelector(selector);
const labels = { PENDENTE: 'Pendentes', EM_ATENDIMENTO: 'Em atendimento' };
const colors = { 1: '#2e7d52', 2: '#b27800', 3: '#d57d37', 4: '#c84c4c', PENDENTE: '#b27800', EM_ATENDIMENTO: '#2459a8' };
const dateOptions = { timeZone: 'America/Sao_Paulo' };
const formatDate = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR', { ...dateOptions, day: '2-digit', month: 'short' }).replace('.', '');
const parseDate = (value) => new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
const formatHours = (hours) => hours < 1 / 60 ? 'Menos de 1 min' : hours < 1 ? `${Math.round(hours * 60)} min` : hours < 24 ? `${hours.toFixed(1).replace('.', ',')} h` : `${(hours / 24).toFixed(1).replace('.', ',')} dias`;
const escape = (value) => { const el = document.createElement('div'); el.textContent = value == null ? '' : String(value); return el.innerHTML; };
let map, concentrationLayer;
try {
  if (typeof L !== 'undefined') {
    map = L.map('admin-map', { minZoom: 4, maxZoom: 18, scrollWheelZoom: false }).setView([-23.25, -49.85], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    concentrationLayer = L.layerGroup().addTo(map);
  }
} catch { map = null; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 3500); }
async function api(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  if (response.status === 401) { sessionStorage.clear(); location.replace('/login.html'); throw new Error('Sessão encerrada.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.erro || 'Não foi possível carregar os indicadores.');
  return body;
}
function bars(items, colorFor) {
  const max = Math.max(1, ...items.map((item) => item.total));
  return items.map((item) => `<div class="bar-row"><div><strong>${escape(item.nome)}</strong><span>${item.total}</span></div><i><b style="width:${item.total / max * 100}%;background:${colorFor(item)}"></b></i></div>`).join('');
}
function renderActivity(days) {
  const step = Math.max(1, Math.ceil(days.length / 10));
  const groups = [];
  for (let i = 0; i < days.length; i += step) {
    const chunk = days.slice(i, i + step);
    groups.push({ first: chunk[0].data, last: chunk.at(-1).data, abertas: chunk.reduce((n, d) => n + d.abertas, 0), concluidas: chunk.reduce((n, d) => n + d.concluidas, 0) });
  }
  const max = Math.max(1, ...groups.flatMap((d) => [d.abertas, d.concluidas]));
  const hasActivity = groups.some((d) => d.abertas || d.concluidas);
  $('#activity-chart').innerHTML = hasActivity ? `<div class="activity-columns">${groups.map((d) => {
    const date = d.first === d.last ? formatDate(d.first) : `${formatDate(d.first)} a ${formatDate(d.last)}`;
    return `<div class="activity-column" tabindex="0" aria-label="${date}: ${d.abertas} abertas e ${d.concluidas} concluídas" title="${date}: ${d.abertas} abertas · ${d.concluidas} concluídas"><div class="activity-bars"><div style="height:${d.abertas / max * 100}%" class="opened-bar">${d.abertas ? `<span>${d.abertas}</span>` : ''}</div><div style="height:${d.concluidas / max * 100}%" class="completed-bar">${d.concluidas ? `<span>${d.concluidas}</span>` : ''}</div></div><small>${formatDate(d.first)}</small></div>`;
  }).join('')}</div>${step > 1 ? `<p class="chart-footnote">Barras agrupadas em até ${step} dias. Passe o cursor ou use Tab para ver os totais.</p>` : ''}` : '<div class="empty-state"><strong>Nenhuma entrada ou conclusão</strong><span>Não houve movimento neste período. A fila atual continua ao lado.</span></div>';
}
function render(data) {
  const r = data.resumo;
  const cards = [
    ['Abertas no período', r.total, 'Pela data de abertura', 'opened'],
    ['Concluídas no período', r.concluidas, 'Pela data de conclusão', 'completed'],
    ['Tempo médio de serviço', r.atendimentos_com_tempo ? formatHours(r.tempo_medio_horas) : '—', r.atendimentos_com_tempo ? `Início à conclusão · ${r.atendimentos_com_tempo} serviço(s)` : 'Sem serviços com duração registrada', 'duration'],
    ['Pendentes agora', r.pendentes, 'Todos os chamados ainda na fila', 'pending'],
    ['Em atendimento agora', r.em_atendimento, 'Todos os serviços em andamento', 'progress']
  ];
  $('#summary').innerHTML = cards.map(([title, value, detail, kind]) => `<article class="summary-card ${kind}" data-metric="${kind}"><span>${title}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
  $('#period-caption').textContent = `${formatDate(data.periodo.inicio)} a ${formatDate(data.periodo.fim)} de ${data.periodo.fim.slice(0, 4)} · horário de Brasília`;
  $('#updated').textContent = `Atualizado às ${new Date(data.atualizado_em).toLocaleTimeString('pt-BR', { ...dateOptions, hour: '2-digit', minute: '2-digit' })}`;
  renderActivity(data.evolucao);
  $('#queue-overview').innerHTML = `<strong>${data.fila.total}</strong><span>chamado(s) em aberto</span>`;
  $('#status-chart').innerHTML = data.por_status.map((item) => `<div class="status-metric"><i style="background:${colors[item.nome]}"></i><div><strong>${labels[item.nome]}</strong><span>${item.total} <small>· ${data.fila.total ? Math.round(item.total / data.fila.total * 100) : 0}% da fila</small></span></div></div>`).join('');
  $('#queue-note').textContent = data.fila.total ? `${data.fila.urgentes} com urgência alta ou crítica. ${data.fila.aguardando_validacao} aguardando validação.` : 'Fila em dia. Nenhum chamado aguardando atendimento.';
  $('#urgency-chart').innerHTML = r.total ? bars(data.por_urgencia, (item) => colors[item.grau]) : '<p class="empty-state">Nenhum chamado aberto no período.</p>';
  $('#city-ranking').innerHTML = data.por_cidade.length ? bars(data.por_cidade.slice(0, 8), () => '#2459a8') : '<p class="empty-state">Nenhum chamado aberto no período.</p>';
  $('#region-ranking').innerHTML = data.por_regiao.length ? bars(data.por_regiao, () => '#2e7d52') : '<p class="empty-state">Nenhum chamado aberto no período.</p>';
  $('#recent-completions').innerHTML = data.recentes.length ? `<div class="completion-table"><table><thead><tr><th>Chamado</th><th>Cidade</th><th>Conclusão</th><th>Tempo de serviço</th></tr></thead><tbody>${data.recentes.map((row) => {
    const hours = (parseDate(row.concluido_em) - parseDate(row.atendimento_iniciado_em)) / 3600000;
    return `<tr><td><span class="report-number">#${escape(row.id)}</span><strong>${escape(row.titulo)}</strong></td><td>${escape(row.cidade || 'Não identificada')}</td><td>${escape(parseDate(row.concluido_em).toLocaleString('pt-BR', { ...dateOptions, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</td><td>${row.atendimento_iniciado_em && Number.isFinite(hours) && hours >= 0 ? formatHours(hours) : 'Sem início registrado'}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>Nenhum chamado concluído no período</strong><span>As conclusões aparecem aqui pela data de finalização, mesmo que a abertura seja antiga.</span></div>';
  $('#legacy-note').classList.toggle('hidden', !data.conclusoes_sem_data);
  $('#legacy-note').textContent = `${data.conclusoes_sem_data} chamado(s) concluído(s) sem data de conclusão registrada. Esses registros não entram nos totais por período.`;
  const located = data.por_cidade.filter((city) => Number.isFinite(city.latitude) && Number.isFinite(city.longitude));
  $('#map-empty').classList.toggle('hidden', Boolean(map && located.length));
  $('#map-empty').textContent = !map ? 'Mapa indisponível. Os totais por cidade continuam disponíveis acima.' : 'Nenhuma localização para exibir no período selecionado.';
  $('#admin-map').classList.toggle('hidden', !map || !located.length);
  if (map) {
    concentrationLayer.clearLayers();
    located.forEach((city) => L.circleMarker([city.latitude, city.longitude], { radius: Math.min(28, 7 + Math.sqrt(city.total) * 4), color: '#255e55', weight: 1.5, fillColor: '#2e7d52', fillOpacity: .6 }).bindPopup(`<strong>${escape(city.nome)}</strong><br>${city.total} registro(s)`).addTo(concentrationLayer));
    if (located.length) requestAnimationFrame(() => { map.invalidateSize(); map.fitBounds(located.map((city) => [city.latitude, city.longitude]), { padding: [40, 40], maxZoom: 12 }); });
  }
}
let requestId = 0;
let controller;
async function load() {
  const id = ++requestId;
  controller?.abort(); controller = new AbortController();
  $('#dashboard-content').setAttribute('aria-busy', 'true');
  $('#refresh').disabled = true;
  $('#updated').textContent = 'Atualizando…';
  try {
    const data = await api(`/api/admin/dashboard?periodo=${$('#period').value}`, { signal: controller.signal });
    if (id !== requestId) return;
    render(data);
    $('#dashboard-content').classList.remove('hidden');
    $('#load-error').classList.add('hidden');
  } catch (error) {
    if (id !== requestId || error.name === 'AbortError') return;
    $('#dashboard-content').classList.add('hidden');
    $('#load-error').textContent = `${error.message} Clique em atualizar para tentar novamente.`;
    $('#load-error').classList.remove('hidden');
    $('#updated').textContent = 'Dados indisponíveis';
  } finally {
    if (id === requestId) { $('#dashboard-content').setAttribute('aria-busy', 'false'); $('#refresh').disabled = false; }
  }
}
$('#period').addEventListener('change', load);
$('#refresh').addEventListener('click', load);
$('#logout').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); } finally { sessionStorage.clear(); location.replace('/login.html'); } });
api('/api/auth/me').then((user) => { if (user.papel !== 'ADMIN') { location.replace('/central.html'); return; } load(); }).catch((error) => { $('#load-error').textContent = error.message; $('#load-error').classList.remove('hidden'); });
setInterval(() => { if (!document.hidden) load(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
