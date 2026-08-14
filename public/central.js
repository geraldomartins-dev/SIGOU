const token = sessionStorage.getItem('sigou_token');
if (!token) location.replace('/login.html');

const BOUNDS = L.latLngBounds([-24.55, -51.35], [-22.25, -48.55]);
const COLORS = { 1: '#2db56d', 2: '#e6b91e', 3: '#f28c28', 4: '#e84949' };
const LABELS = { 1: 'Baixa', 2: 'Média', 3: 'Alta', 4: 'Crítica' };
const STATUSES = { PENDENTE: 'Pendente', EM_ATENDIMENTO: 'Em atendimento', CONCLUIDA: 'Concluída' };
const VERIFICATIONS = { AGUARDANDO_VALIDACAO: 'Aguardando validação', VALIDADA: 'Validada', REJEITADA: 'Rejeitada' };
const CONTACT_STATUSES = { NAO_CONTATADO: 'Não contatado', CONTATADO: 'Contatado', SEM_RESPOSTA: 'Sem resposta' };
const map = L.map('operations-map', { maxBounds: BOUNDS, maxBoundsViscosity: 1, minZoom: 8 }).setView([-23.25, -49.85], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { minZoom: 8, maxZoom: 19, noWrap: true, attribution: '&copy; OpenStreetMap' }).addTo(map);

let reports = [], attendant, attendantMarker, accuracyCircle, routeLine;
let selecting = false, watchId = null, firstGpsFix = true, calculating = false;
let lastPriorityPosition, lastPriorityAt = 0, reportsSignature = '';
const markers = new Map();

const escape = (value) => { const el = document.createElement('div'); el.textContent = value; return el.innerHTML; };
const inside = ({ lat, lng }) => lat >= -24.55 && lat <= -22.25 && lng >= -51.35 && lng <= -48.55;
const icon = (urgency, recommended = false) => L.divIcon({ className: '', html: `<div class="report-marker ${recommended ? 'recommended-marker' : ''}" style="width:22px;height:22px;background:${COLORS[urgency]}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] });

function toast(message) {
  const el = document.querySelector('#toast'); el.textContent = message; el.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  if (response.status === 401) { sessionStorage.removeItem('sigou_token'); location.replace('/login.html'); throw new Error('Sessão encerrada.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.erro || 'Falha na operação.');
  return body;
}

function render() {
  document.querySelector('#report-count').textContent = reports.length;
  document.querySelector('#report-list').innerHTML = reports.length ? reports.map((report) => {
    const waiting = report.verificacao_status === 'AGUARDANDO_VALIDACAO';
    const badge = report.verificacao_status === 'VALIDADA' ? 'validated' : '';
    return `<article class="report-item" style="--marker-color:${COLORS[report.grau_urgencia]}"><h3>${escape(report.titulo)}</h3><p>${escape(report.descricao)}</p><div class="report-meta"><strong>${LABELS[report.grau_urgencia]}</strong><span>${STATUSES[report.status]}</span></div>${contactHtml(report)}${report.evidencia_url ? `<a class="evidence-link" href="${escape(report.evidencia_url)}" target="_blank">Ver foto ↗</a>` : ''}<div class="verification-row"><span class="verification-badge ${badge}">${VERIFICATIONS[report.verificacao_status]}</span><span class="confidence">Confiança ${report.confianca}%</span></div>${waiting ? `<div class="status-actions verify-actions"><button data-verification="VALIDADA" data-id="${report.id}">Validar</button><button data-verification="REJEITADA" data-id="${report.id}">Rejeitar</button></div>` : ''}<div class="status-actions"><button data-status="EM_ATENDIMENTO" data-id="${report.id}" ${report.verificacao_status !== 'VALIDADA' && report.grau_urgencia !== 4 ? 'disabled' : ''}>Atender</button><button data-status="CONCLUIDA" data-id="${report.id}">Concluir</button></div></article>`;
  }).join('') : '<p class="muted">Nenhuma ocorrência ativa.</p>';
}

function contactHtml(report) {
  if (!report.consentimento_contato || (!report.telefone && !report.email && !report.contato)) return '';
  const phone = report.telefone || report.contato || '';
  const phoneDigits = phone.replace(/\D/g, '');
  const whatsappDigits = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;
  const actions = [
    phone ? `<a href="tel:${escape(phoneDigits)}">Ligar</a>` : '',
    phoneDigits.length >= 10 ? `<a href="https://wa.me/${escape(whatsappDigits)}" target="_blank" rel="noopener">WhatsApp</a>` : '',
    report.email ? `<a href="mailto:${escape(report.email)}?subject=${encodeURIComponent(`SIGOU - ocorrência ${report.id}`)}">E-mail</a>` : ''
  ].filter(Boolean).join('');
  const options = Object.entries(CONTACT_STATUSES).map(([value, label]) => `<option value="${value}" ${report.contato_status === value ? 'selected' : ''}>${label}</option>`).join('');
  return `<div class="contact-panel"><strong>Contato autorizado</strong><span>${escape(phone || report.email)}</span><div class="contact-actions">${actions}</div><select data-contact-status="${report.id}" aria-label="Status do contato">${options}</select></div>`;
}

async function load() {
  reports = await api('/api/denuncias');
  markers.forEach((marker) => marker.remove()); markers.clear();
  reports.forEach((report) => markers.set(report.id, L.marker([report.latitude, report.longitude], { icon: icon(report.grau_urgencia) }).addTo(map).bindPopup(`<strong>${escape(report.titulo)}</strong><br>${escape(report.descricao)}`)));
  render();
  return reports.map((report) => `${report.id}:${report.status}:${report.verificacao_status}:${report.atualizado_em}`).join('|');
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function setLocationStatus(mode, text) {
  const status = document.querySelector('#location-status'); status.className = `location-status ${mode}`; status.querySelector('span').textContent = text;
}

function updateAttendant(latitude, longitude, accuracy, source) {
  const latlng = { lat: latitude, lng: longitude };
  if (!inside(latlng)) { setLocationStatus('warning', 'Fora da área atendida'); return false; }
  attendant = { latitude, longitude };
  if (attendantMarker) attendantMarker.setLatLng(latlng); else attendantMarker = L.circleMarker(latlng, { radius: 9, color: '#10243e', weight: 4, fillColor: '#39a9ff', fillOpacity: 1 }).addTo(map).bindTooltip('Equipe em tempo real');
  if (accuracyCircle) accuracyCircle.remove();
  if (accuracy) accuracyCircle = L.circle(latlng, { radius: accuracy, color: '#39a9ff', weight: 1, fillOpacity: .08, interactive: false }).addTo(map);
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.querySelector('#attendant-coordinates').textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracy ? ` · precisão ${Math.round(accuracy)} m` : ''}`;
  document.querySelector('#calculate').disabled = false;
  setLocationStatus(source === 'gps' ? 'online' : 'manual', source === 'gps' ? `GPS ativo · ${time}` : 'Posição manual');
  if (source === 'gps' && firstGpsFix) { map.setView(latlng, 15); firstGpsFix = false; }
  return true;
}

async function calculatePriority(automatic = false) {
  if (!attendant || calculating) return;
  calculating = true;
  try {
    const result = await api('/api/denuncias/proxima', { method: 'POST', body: JSON.stringify(attendant) });
    lastPriorityPosition = { ...attendant }; lastPriorityAt = Date.now();
    if (!result.recomendada && result.triagem_recomendada) {
      reportsSignature = await load();
      const triage = result.triagem_recomendada, marker = markers.get(triage.id);
      if (marker) marker.setIcon(icon(triage.grau_urgencia, true)).openPopup();
      if (routeLine) { routeLine.remove(); routeLine = null; }
      const card = document.querySelector('#recommendation');
      card.innerHTML = `<p class="eyebrow">VALIDAR PRIMEIRO</p><h3>${escape(triage.titulo)}</h3><p class="recommendation-copy">Não há serviço validado. Esta é a denúncia mais urgente para triagem.</p><div class="metrics"><span>${LABELS[triage.grau_urgencia]}</span><span>${triage.distancia_km.toFixed(2)} km</span><span>Confiança ${triage.confianca}%</span></div><button class="button primary recommendation-validate" data-recommend-validation="${triage.id}">Validar e recomendar serviço</button>`;
      card.classList.remove('hidden');
      return;
    }
    if (!result.recomendada) { document.querySelector('#recommendation').classList.add('hidden'); if (!automatic) toast('Não há ocorrências pendentes.'); return; }
    reportsSignature = await load();
    const report = result.recomendada, marker = markers.get(report.id);
    if (marker) marker.setIcon(icon(report.grau_urgencia, true)).openPopup();
    if (routeLine) routeLine.remove();
    routeLine = L.polyline([[attendant.latitude, attendant.longitude], [report.latitude, report.longitude]], { color: '#109d92', weight: 5, dashArray: '9 8' }).addTo(map);
    if (!automatic) map.fitBounds(routeLine.getBounds(), { padding: [60, 60], maxZoom: 15 });
    const warning = report.verificacao_status !== 'VALIDADA' ? '<span class="unverified-warning">⚠ Crítica não confirmada</span>' : '';
    const card = document.querySelector('#recommendation');
    card.innerHTML = `<p class="eyebrow">${automatic ? 'RECOMENDAÇÃO AUTOMÁTICA' : 'RECOMENDADA AGORA'}</p><h3>${escape(report.titulo)}</h3><div class="metrics"><span>${LABELS[report.grau_urgencia]}</span><span>${report.distancia_km.toFixed(2)} km</span><span>Score ${report.score.toFixed(2)}</span>${warning}</div>`; card.classList.remove('hidden');
  } catch (error) { if (!automatic) toast(error.message); } finally { calculating = false; }
}

function onGpsPosition(position) {
  const { latitude, longitude, accuracy } = position.coords;
  if (!updateAttendant(latitude, longitude, accuracy, 'gps')) return;
  const moved = distanceMeters(lastPriorityPosition, attendant) >= 200;
  const intervalElapsed = Date.now() - lastPriorityAt >= 30_000;
  if (!lastPriorityPosition || (moved && intervalElapsed)) calculatePriority(true);
}

function stopLiveLocation() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null; firstGpsFix = true;
  const button = document.querySelector('#live-location'); button.textContent = 'Ativar localização em tempo real'; button.classList.remove('danger');
  setLocationStatus(attendant ? 'manual' : 'offline', attendant ? 'Rastreamento pausado' : 'GPS desativado');
}

function startLiveLocation() {
  if (watchId !== null) return;
  if (!navigator.geolocation) return toast('Este dispositivo não oferece localização.');
  setLocationStatus('searching', 'Buscando sinal GPS…');
  watchId = navigator.geolocation.watchPosition(onGpsPosition, (error) => {
    toast({ 1: 'Permissão de localização negada.', 2: 'Localização indisponível.', 3: 'Tempo esgotado ao buscar GPS.' }[error.code] || 'Não foi possível obter a localização.'); stopLiveLocation();
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  const button = document.querySelector('#live-location'); button.textContent = 'Parar localização em tempo real'; button.classList.add('danger');
}

document.querySelector('#live-location').addEventListener('click', () => watchId !== null ? stopLiveLocation() : startLiveLocation());

document.querySelector('#attendant-mode').addEventListener('click', (event) => { selecting = !selecting; event.target.classList.toggle('active', selecting); event.target.textContent = selecting ? 'Clique agora no mapa…' : 'Definir manualmente no mapa'; });
map.on('click', ({ latlng }) => {
  if (!selecting) return;
  if (!inside(latlng)) return toast('Selecione uma posição dentro da área atendida.');
  if (watchId !== null) stopLiveLocation();
  updateAttendant(latlng.lat, latlng.lng, null, 'manual'); selecting = false; document.querySelector('#attendant-mode').textContent = 'Alterar posição manual';
  calculatePriority(true);
});
document.querySelector('#calculate').addEventListener('click', () => calculatePriority(false));

document.querySelector('#report-list').addEventListener('click', async (event) => {
  const verify = event.target.closest('[data-verification]');
  if (verify) {
    let justificativa = '';
    if (verify.dataset.verification === 'REJEITADA') { justificativa = prompt('Justificativa da rejeição:') || ''; if (justificativa.length < 5) return toast('Informe uma justificativa.'); }
    try { await api(`/api/denuncias/${verify.dataset.id}/verificacao`, { method: 'PATCH', body: JSON.stringify({ status: verify.dataset.verification, justificativa }) }); reportsSignature = await load(); if (attendant) calculatePriority(true); toast('Verificação registrada.'); } catch (error) { toast(error.message); }
    return;
  }
  const status = event.target.closest('[data-status]');
  if (status) try { await api(`/api/denuncias/${status.dataset.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: status.dataset.status }) }); reportsSignature = await load(); if (attendant) calculatePriority(true); toast('Status atualizado.'); } catch (error) { toast(error.message); }
});

document.querySelector('#report-list').addEventListener('change', async (event) => {
  const select = event.target.closest('[data-contact-status]');
  if (!select) return;
  try {
    await api(`/api/denuncias/${select.dataset.contactStatus}/contato-status`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
    reportsSignature = await load(); toast('Status do contato atualizado.');
  } catch (error) { toast(error.message); }
});

document.querySelector('#recommendation').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-recommend-validation]');
  if (!button) return;
  try {
    await api(`/api/denuncias/${button.dataset.recommendValidation}/verificacao`, { method: 'PATCH', body: JSON.stringify({ status: 'VALIDADA' }) });
    reportsSignature = await load();
    await calculatePriority(true);
    toast('Denúncia validada e serviço recomendado.');
  } catch (error) { toast(error.message); }
});

// Detecta novas ocorrências sem exigir ação do operador.
setInterval(async () => {
  try {
    const newSignature = await load();
    if (reportsSignature && newSignature !== reportsSignature && attendant) await calculatePriority(true);
    reportsSignature = newSignature;
  } catch {}
}, 30_000);

document.querySelector('#logout').addEventListener('click', async () => { stopLiveLocation(); try { await api('/api/auth/logout', { method: 'POST' }); } finally { sessionStorage.removeItem('sigou_token'); location.replace('/login.html'); } });
window.addEventListener('beforeunload', () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); });
api('/api/auth/me').then(() => load()).then((signature) => {
  reportsSignature = signature;
  requestAnimationFrame(() => map.invalidateSize());
  startLiveLocation();
}).catch((error) => toast(error.message));
