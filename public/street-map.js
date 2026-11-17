function addStreetMap(map) {
  const minStreetZoom = 15;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 8,
    maxZoom: 20,
    maxNativeZoom: 19,
    noWrap: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const pane = map.createPane('ibge-streets');
  pane.style.zIndex = '350';
  const streets = L.geoJSON(null, {
    pane: 'ibge-streets',
    renderer: L.canvas({ pane: 'ibge-streets' }),
    attribution: '<a href="https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/28971-base-de-faces-de-logradouros-do-brasil.html">Trechos: IBGE (2022)</a>',
    style: { color: '#3d687e', weight: 2, opacity: 0.75 },
    onEachFeature(feature, layer) {
      const name = document.createElement('span');
      name.textContent = feature.properties.nome;
      layer.bindTooltip(name, { sticky: true });
    }
  });
  let request, loadedBounds, pendingBounds;

  async function loadStreets() {
    if (map.getZoom() < minStreetZoom) {
      request?.abort();
      request = undefined;
      pendingBounds = undefined;
      loadedBounds = undefined;
      streets.clearLayers().remove();
      return;
    }
    const bbox = map.getBounds().toBBoxString().split(',').map((value) => Number(value).toFixed(5)).join(',');
    if (pendingBounds === bbox) return;
    request?.abort();
    if (loadedBounds === bbox) return;
    const controller = new AbortController();
    request = controller;
    pendingBounds = bbox;
    try {
      const response = await fetch(`/api/enderecos/trechos?bbox=${bbox}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)])
      });
      if (!response.ok) return;
      const data = await response.json();
      if (controller.signal.aborted) return;
      streets.clearLayers().addData(data).addTo(map);
      loadedBounds = bbox;
    } catch {
      // O mapa base e a marcação continuam disponíveis se a camada local falhar.
    } finally {
      if (request === controller) {
        request = undefined;
        pendingBounds = undefined;
      }
    }
  }

  map.on('moveend', loadStreets);
  loadStreets();
}
