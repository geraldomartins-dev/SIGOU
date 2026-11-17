const REGION_BOUNDS = L.latLngBounds([-24.55, -51.35], [-22.25, -48.55]);
const COLORS = { 1: '#2db56d', 2: '#e6b91e', 3: '#f28c28', 4: '#e84949' };
// Dá ao servidor tempo para aguardar o geocodificador e responder ao navegador.
const ADDRESS_SEARCH_TIMEOUT_MS = 25_000;
const $ = (selector) => document.querySelector(selector);
const map = L.map('citizen-map', { maxBounds: REGION_BOUNDS, maxBoundsViscosity: 1, minZoom: 8 }).setView([-23.25, -49.85], 8);
addStreetMap(map);
let selectedPosition, selectionMarker, positionSource, searchController, searchVersion = 0, fallbackCity;
const inside = ({ lat, lng }) => lat >= -24.55 && lat <= -22.25 && lng >= -51.35 && lng <= -48.55;
const icon = (urgency) => L.divIcon({ className: '', html: `<div class="report-marker" style="width:22px;height:22px;background:${COLORS[urgency]}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add('hidden'), 4000);
}
async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detalhes?.join(' ') || body.erro || 'Falha na requisição.');
  return body;
}
function addressStatus(message, error = false) {
  $('#address-status').textContent = message;
  $('#address-status').classList.toggle('address-error', error);
}
function clearPosition() {
  selectionMarker?.remove(); selectionMarker = undefined; selectedPosition = undefined; positionSource = undefined;
  $('#report-coordinates').textContent = 'Nenhum ponto marcado';
  $('#show-position').classList.add('hidden');
  $('.map-hint').textContent = 'Clique no mapa para marcar a ocorrência';
}
function selectPosition(latlng, source) {
  if (!inside(latlng)) { toast('Selecione um local no Norte Pioneiro ou na região de Ourinhos.'); return false; }
  selectedPosition = { latitude: latlng.lat, longitude: latlng.lng };
  positionSource = source;
  if (selectionMarker) selectionMarker.setLatLng(latlng);
  else {
    selectionMarker = L.marker(latlng, { icon: icon(Number($('#urgencia').value)), draggable: true }).addTo(map).bindTooltip('Arraste para ajustar o local');
    selectionMarker.on('dragend', () => {
      const next = selectionMarker.getLatLng();
      if (!inside(next)) {
        selectionMarker.setLatLng([selectedPosition.latitude, selectedPosition.longitude]);
        toast('Mantenha o marcador dentro da área atendida.'); return;
      }
      selectPosition(next, 'manual');
    });
  }
  selectionMarker.setTooltipContent('Arraste para ajustar o local');
  $('#report-coordinates').textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  $('#show-position').classList.remove('hidden');
  $('.map-hint').textContent = 'Arraste o marcador ou clique para ajustar o ponto';
  addressStatus(source === 'search' ? 'Local aproximado encontrado. Confira o ponto no mapa e ajuste se precisar.' : 'Ponto marcado no mapa. O endereço digitado será salvo como referência.');
  return true;
}
function showPosition() {
  if (!selectedPosition) return;
  map.setView([selectedPosition.latitude, selectedPosition.longitude], 17);
  if (matchMedia('(max-width: 760px)').matches) $('.citizen-map-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function cancelSearch() {
  searchVersion++; searchController?.abort();
  $('#address-results').replaceChildren();
  $('#address-fallback').classList.add('hidden');
  $('#address-search').disabled = false;
  $('#address-search').textContent = 'Localizar no mapa';
}
function showAddressFallback(query, city) {
  const url = new URL('https://www.google.com/maps/search/');
  url.search = new URLSearchParams({ api: '1', query });
  $('#search-google-address').href = url.href;
  fallbackCity = city;
  $('#show-city').classList.toggle('hidden', !city);
  $('#show-city').textContent = city ? `Ver ${city.nome} no mapa e marcar manualmente` : 'Ver cidade no mapa';
  $('#address-fallback').classList.remove('hidden');
}
$('#show-city').addEventListener('click', () => {
  if (!fallbackCity) return;
  map.setView([fallbackCity.latitude, fallbackCity.longitude], 15);
  addressStatus('Este é o centro aproximado da cidade. Clique no mapa para marcar o local da ocorrência.');
  if (matchMedia('(max-width: 760px)').matches) $('.citizen-map-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('#use-coordinates').addEventListener('click', () => {
  const match = $('#paste-coordinates').value.trim().match(/^\(?\s*([+-]?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*\)?$/);
  if (!match) { addressStatus('Cole a latitude e a longitude usando ponto decimal, como no exemplo.', true); return; }
  const point = { lat: Number(match[1]), lng: Number(match[2]) };
  if (selectPosition(point, 'manual')) showPosition();
});
async function searchAddress() {
  const query = $('#endereco').value.trim();
  cancelSearch();
  if (query.length < 3) { addressStatus('Digite o nome da rua para buscar.', true); $('#endereco').focus(); return; }
  const version = searchVersion;
  searchController = new AbortController();
  $('#address-search').disabled = true;
  $('#address-search').textContent = 'Buscando…';
  addressStatus('Procurando endereços na área atendida…');
  try {
    const params = new URLSearchParams({ busca: query });
    if (map.getZoom() >= 15) params.set('bbox', map.getBounds().toBBoxString());
    const data = await request(`/api/enderecos?${params}`, {
      signal: AbortSignal.any([searchController.signal, AbortSignal.timeout(ADDRESS_SEARCH_TIMEOUT_MS)])
    });
    if (version !== searchVersion) return;
    if (!data.resultados.length) {
      addressStatus('Não encontramos uma rua compatível na base atual. Confira a escrita e a cidade, ou use uma das opções abaixo.');
      showAddressFallback(query, data.cidade_aproximada); return;
    }
    addressStatus('Escolha o endereço correto para marcar no mapa.');
    const selectAddress = (result) => {
      if (!selectPosition({ lat: result.latitude, lng: result.longitude }, 'search')) return;
      const streetName = document.createElement('span');
      streetName.textContent = result.endereco.split(' · ')[0];
      selectionMarker.setTooltipContent(streetName).openTooltip();
      // Mantém o número informado, mesmo quando o provedor só encontra a rua.
      $('#endereco').value = /\d/.test(query) ? query : result.endereco;
      cancelSearch(); showPosition();
    };
    if (data.resultados.length === 1 && !data.resultados[0].no_mapa) {
      selectAddress(data.resultados[0]);
      return;
    }
    data.resultados.forEach((result) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'address-result';
      const title = document.createElement('strong'), detail = document.createElement('span');
      const [street, ...rest] = result.endereco.split(' · ');
      title.textContent = street;
      if (result.no_mapa) rest.push('Trecho visível no mapa (IBGE)');
      else if (result.fonte === 'IBGE') rest.push('Ponto aproximado da rua (IBGE)');
      detail.textContent = rest.join(' · ');
      button.append(title, detail);
      button.addEventListener('click', () => selectAddress(result));
      $('#address-results').append(button);
    });
  } catch (error) {
    if (version !== searchVersion) return;
    addressStatus(error.name === 'TimeoutError' ? 'A busca demorou mais que o esperado. Tente novamente ou marque no mapa.' : error.message, true);
    showAddressFallback(query, null);
  } finally {
    if (version === searchVersion) { $('#address-search').disabled = false; $('#address-search').textContent = 'Localizar no mapa'; }
  }
}
$('#address-search').addEventListener('click', searchAddress);
$('#endereco').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchAddress(); } });
$('#endereco').addEventListener('input', () => {
  cancelSearch();
  if (positionSource === 'search') { clearPosition(); addressStatus('Endereço alterado. Busque novamente ou marque o novo local no mapa.'); }
  else addressStatus('Se houver ruas com o mesmo nome, inclua a cidade na busca.');
});
$('#show-position').addEventListener('click', showPosition);
map.on('click', ({ latlng }) => {
  if (!reportReceipt.classList.contains('hidden')) return;
  cancelSearch();
  selectPosition(latlng, 'manual');
});
$('#urgencia').addEventListener('change', (event) => selectionMarker?.setIcon(icon(Number(event.target.value))));
$('#foto').addEventListener('change', (event) => { $('#photo-name').textContent = event.target.files[0]?.name || 'JPG, PNG ou WebP'; });
const reportForm = $('#report-form');
const reportReceipt = $('#report-receipt');
const reportReference = $('#report-reference');
const receiptFeedback = $('#receipt-feedback');

function showReceipt(report) {
  clearTimeout(toast.timer);
  $('#toast').classList.add('hidden');
  const reference = String(report?.id ?? '');
  const available = /^[1-9]\d*$/.test(reference);
  reportReference.value = available ? reference : '';
  const key = report?.chave_acompanhamento;
  const hasTracking = typeof key === 'string' && /^[A-Za-z0-9_-]{32}$/.test(key);
  $('#receipt-tracking').classList.toggle('hidden', !hasTracking);
  const link = new URL('/acompanhar.html', location.origin);
  if (hasTracking) link.hash = key;
  $('#open-tracking').href = link.href;
  $('#receipt-reference').classList.toggle('hidden', !available);
  receiptFeedback.textContent = available ? '' : 'O número de registro ficou indisponível.';
  reportForm.classList.add('hidden');
  reportReceipt.classList.remove('hidden');
  $('.map-hint').textContent = 'Para marcar outro local, registre uma nova ocorrência';
  $('#report-receipt-title').focus();
}

$('#copy-reference').addEventListener('click', async () => {
  const reference = reportReference.value;
  try {
    await navigator.clipboard.writeText(reference);
    if (reportReference.value === reference) receiptFeedback.textContent = 'Número copiado.';
  } catch {
    if (reportReference.value !== reference) return;
    reportReference.focus();
    reportReference.select();
    receiptFeedback.textContent = 'Número selecionado. Use a opção de copiar do seu dispositivo.';
  }
});

$('#copy-tracking-link').addEventListener('click', async () => {
  const link = $('#open-tracking').href;
  try {
    await navigator.clipboard.writeText(link);
    if ($('#open-tracking').href === link) receiptFeedback.textContent = 'Link privado copiado.';
  } catch {
    if ($('#open-tracking').href !== link) return;
    receiptFeedback.textContent = 'Abra o acompanhamento e copie o link na barra de endereços.';
    $('#open-tracking').focus();
  }
});

$('#new-report').addEventListener('click', () => {
  $('#open-tracking').href = '/acompanhar.html';
  reportReference.value = '';
  receiptFeedback.textContent = '';
  reportReceipt.classList.add('hidden');
  reportForm.classList.remove('hidden');
  $('.map-hint').textContent = 'Clique no mapa para marcar a ocorrência';
  $('#titulo').focus();
});

reportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedPosition) { addressStatus('Escolha um endereço da busca ou marque o local no mapa antes de enviar.', true); return toast('Marque o local da ocorrência no mapa.'); }
  const data = new FormData();
  ['titulo', 'descricao', 'endereco'].forEach((name) => data.set(name, $(`#${name}`).value));
  data.set('grau_urgencia', $('#urgencia').value);
  data.set('telefone', $('#telefone').value); data.set('email', $('#email').value);
  data.set('consentimento_contato', $('#consentimento-contato').checked);
  data.set('latitude', selectedPosition.latitude); data.set('longitude', selectedPosition.longitude);
  const photo = $('#foto').files[0]; if (photo) data.set('foto', photo);
  const submit = event.submitter || $('#report-form button[type=submit]');
  submit.disabled = true;
  try {
    const report = await request('/api/denuncias', { method: 'POST', body: data });
    reportForm.reset(); cancelSearch(); clearPosition();
    $('#paste-coordinates').value = '';
    $('#photo-name').textContent = 'JPG, PNG ou WebP';
    addressStatus('Busque uma rua e cidade ou marque o ponto diretamente no mapa.');
    showReceipt(report);
  } catch (error) { toast(error.message); }
  finally { submit.disabled = false; }
});
request('/api/health').then(() => {
  const el = $('#api-status'); el.textContent = '● Sistema online'; el.classList.add('online');
  requestAnimationFrame(() => map.invalidateSize());
}).catch(() => { const el = $('#api-status'); el.textContent = '● API indisponível'; el.classList.add('offline'); });
