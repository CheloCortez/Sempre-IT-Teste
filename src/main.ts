import L, { type LatLngBoundsExpression, type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { pb } from './pocketbase';

interface Venue {
  id: string;
  slug: string;
  name: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  courts: number | null;
  surface: string | null;
  indoor: boolean | null;
  access_type: string;
  notes_pt: string;
  source_url: string;
  active: boolean;
}

type Coverage = 'all' | 'indoor' | 'outdoor';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const initialCenter: L.LatLngExpression = [-23.612, -46.689];
let map: LeafletMap;
let markerLayer: L.LayerGroup;
let venues: Venue[] = [];
let selectedNeighborhood = 'all';
let selectedCoverage: Coverage = 'all';
let detailTrigger: HTMLElement | null = null;

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Não foi possível iniciar a interface.');
}

root.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#top" aria-label="PickleWorld — início">
      <span class="brand-ball" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>PickleWorld</span>
    </a>
    <p>Quadras de pickleball em São Paulo</p>
  </header>

  <main id="top" class="app-shell">
    <section class="intro" aria-labelledby="page-title">
      <div>
        <p class="kicker">Seu próximo jogo começa aqui</p>
        <h1 id="page-title">Encontre uma quadra e vá jogar.</h1>
      </div>
      <p class="intro-copy">Explore espaços da região de lançamento, compare a cobertura e abra a rota sem perder tempo.</p>
    </section>

    <section class="filters" aria-labelledby="filter-title">
      <div class="filter-heading">
        <h2 id="filter-title">Filtrar quadras</h2>
        <button class="text-button" id="clear-filters" type="button" hidden>Limpar filtros</button>
      </div>
      <div class="filter-controls">
        <label class="select-field">
          <span>Bairro</span>
          <select id="neighborhood-filter" disabled>
            <option value="all">Todos os bairros</option>
          </select>
        </label>
        <fieldset class="coverage-field" disabled>
          <legend>Cobertura</legend>
          <div class="segmented-control">
            <input type="radio" name="coverage" id="coverage-all" value="all" checked>
            <label for="coverage-all">Todas</label>
            <input type="radio" name="coverage" id="coverage-indoor" value="indoor">
            <label for="coverage-indoor">Cobertas</label>
            <input type="radio" name="coverage" id="coverage-outdoor" value="outdoor">
            <label for="coverage-outdoor">Abertas</label>
          </div>
        </fieldset>
      </div>
    </section>

    <section class="explore-layout" aria-label="Mapa e lista de quadras">
      <div class="map-panel">
        <div class="map-heading">
          <div>
            <h2>Mapa</h2>
            <p id="map-summary" aria-live="polite">Carregando locais…</p>
          </div>
          <button id="fit-map" class="map-action" type="button" disabled>Ver todos</button>
        </div>
        <div id="map" aria-label="Mapa das quadras de pickleball" role="region"></div>
      </div>

      <div class="directory-panel">
        <div class="directory-heading">
          <div>
            <h2>Quadras</h2>
            <p id="result-count" aria-live="polite">Buscando locais ativos…</p>
          </div>
        </div>
        <div id="directory" class="directory" aria-busy="true">
          <div class="status-state loading-state" role="status">
            <span class="loading-ball" aria-hidden="true"></span>
            <div>
              <strong>Procurando quadras</strong>
              <p>Isso deve levar só alguns segundos.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <dialog id="venue-dialog" class="venue-dialog" aria-labelledby="dialog-title">
    <div id="dialog-content"></div>
  </dialog>
`;

const directory = getElement<HTMLElement>('directory');
const neighborhoodFilter = getElement<HTMLSelectElement>('neighborhood-filter');
const coverageField = document.querySelector<HTMLFieldSetElement>('.coverage-field');
const clearFiltersButton = getElement<HTMLButtonElement>('clear-filters');
const fitMapButton = getElement<HTMLButtonElement>('fit-map');
const resultCount = getElement<HTMLElement>('result-count');
const mapSummary = getElement<HTMLElement>('map-summary');
const dialog = getElement<HTMLDialogElement>('venue-dialog');
const dialogContent = getElement<HTMLElement>('dialog-content');

initializeMap();
attachEvents();
void loadVenues();

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento ausente: ${id}`);
  return element as T;
}

function initializeMap() {
  map = L.map('map', {
    center: initialCenter,
    zoom: 12,
    zoomControl: false,
    scrollWheelZoom: false,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
}

function attachEvents() {
  neighborhoodFilter.addEventListener('change', () => {
    selectedNeighborhood = neighborhoodFilter.value;
    renderResults();
  });

  document.querySelectorAll<HTMLInputElement>('input[name="coverage"]').forEach((input) => {
    input.addEventListener('change', () => {
      selectedCoverage = input.value as Coverage;
      renderResults();
    });
  });

  clearFiltersButton.addEventListener('click', () => {
    selectedNeighborhood = 'all';
    selectedCoverage = 'all';
    neighborhoodFilter.value = 'all';
    getElement<HTMLInputElement>('coverage-all').checked = true;
    renderResults();
    neighborhoodFilter.focus();
  });

  fitMapButton.addEventListener('click', () => fitMapToVenues(getFilteredVenues()));

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    detailTrigger?.focus();
    detailTrigger = null;
  });
}

async function loadVenues() {
  setControlsEnabled(false);
  directory.setAttribute('aria-busy', 'true');

  try {
    const records = await pb.collection('venues').getFullList<Venue>({
      filter: 'active = true',
      sort: 'name',
      requestKey: 'active-venues',
    });

    venues = records.filter(isUsableVenue);
    populateNeighborhoods();
    setControlsEnabled(true);
    renderResults();
  } catch (error) {
    console.error('Falha ao carregar locais:', error);
    renderError();
  } finally {
    directory.setAttribute('aria-busy', 'false');
  }
}

function isUsableVenue(venue: Venue) {
  return Boolean(
    venue.active &&
    venue.id &&
    venue.name &&
    venue.neighborhood &&
    venue.address &&
    Number.isFinite(Number(venue.lat)) &&
    Number.isFinite(Number(venue.lng)),
  );
}

function populateNeighborhoods() {
  const neighborhoods = [...new Set(venues.map((venue) => venue.neighborhood.trim()))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  neighborhoodFilter.innerHTML = [
    '<option value="all">Todos os bairros</option>',
    ...neighborhoods.map((neighborhood) =>
      `<option value="${escapeAttribute(neighborhood)}">${escapeHtml(neighborhood)}</option>`,
    ),
  ].join('');
}

function setControlsEnabled(enabled: boolean) {
  neighborhoodFilter.disabled = !enabled;
  if (coverageField) coverageField.disabled = !enabled;
  fitMapButton.disabled = !enabled;
}

function getFilteredVenues() {
  return venues.filter((venue) => {
    const matchesNeighborhood = selectedNeighborhood === 'all' || venue.neighborhood === selectedNeighborhood;
    const matchesCoverage =
      selectedCoverage === 'all' ||
      (selectedCoverage === 'indoor' && venue.indoor === true) ||
      (selectedCoverage === 'outdoor' && venue.indoor !== true);

    return matchesNeighborhood && matchesCoverage;
  });
}

function renderResults() {
  const filteredVenues = getFilteredVenues();
  const hasFilters = selectedNeighborhood !== 'all' || selectedCoverage !== 'all';
  clearFiltersButton.hidden = !hasFilters;

  renderDirectory(filteredVenues);
  renderMarkers(filteredVenues);

  const countLabel = formatVenueCount(filteredVenues.length);
  resultCount.textContent = hasFilters ? `${countLabel} com os filtros atuais` : `${countLabel} na região de lançamento`;
  mapSummary.textContent = filteredVenues.length ? `${countLabel} no mapa` : 'Nenhuma quadra para mostrar';
}

function renderDirectory(filteredVenues: Venue[]) {
  if (!filteredVenues.length) {
    directory.innerHTML = `
      <div class="status-state empty-state">
        <span class="status-symbol" aria-hidden="true">○</span>
        <div>
          <strong>Nenhuma quadra encontrada</strong>
          <p>Tente outro bairro ou veja todos os tipos de cobertura.</p>
          <button class="primary-button" id="empty-clear" type="button">Limpar filtros</button>
        </div>
      </div>
    `;
    getElement<HTMLButtonElement>('empty-clear').addEventListener('click', () => clearFiltersButton.click());
    return;
  }

  directory.innerHTML = filteredVenues.map((venue) => `
    <article class="venue-card" data-venue-id="${escapeAttribute(venue.id)}">
      <button class="venue-card-button" type="button" aria-label="Ver detalhes de ${escapeAttribute(venue.name)}">
        <span class="venue-card-topline">
          <span class="neighborhood">${escapeHtml(venue.neighborhood)}</span>
          <span class="coverage-tag ${venue.indoor === true ? 'is-indoor' : 'is-outdoor'}">
            ${venue.indoor === true ? 'Coberta' : 'Aberta'}
          </span>
        </span>
        <span class="venue-name">${escapeHtml(venue.name)}</span>
        <span class="venue-address">${escapeHtml(venue.address)}</span>
        <span class="venue-meta">
          <span>${formatCourtCount(venue.courts)}</span>
          <span aria-hidden="true">·</span>
          <span>${formatAccessType(venue.access_type)}</span>
        </span>
        <span class="card-action">Ver detalhes <span aria-hidden="true">→</span></span>
      </button>
    </article>
  `).join('');

  directory.querySelectorAll<HTMLButtonElement>('.venue-card-button').forEach((button) => {
    button.addEventListener('click', () => {
      const venueId = button.closest<HTMLElement>('[data-venue-id]')?.dataset.venueId;
      const venue = venues.find((item) => item.id === venueId);
      if (venue) openVenueDetail(venue, button);
    });
  });
}

function renderMarkers(filteredVenues: Venue[]) {
  markerLayer.clearLayers();

  filteredVenues.forEach((venue) => {
    const marker = L.circleMarker([Number(venue.lat), Number(venue.lng)], {
      radius: 10,
      color: '#ffffff',
      weight: 3,
      fillColor: venue.indoor === true ? '#086c55' : '#2d55a2',
      fillOpacity: 1,
      bubblingMouseEvents: false,
    });

    marker.bindTooltip(venue.name, {
      direction: 'top',
      offset: [0, -8],
      opacity: 1,
    });

    marker.on('click', () => openVenueDetail(venue, (marker.getElement() as HTMLElement | null) ?? undefined));
    marker.on('add', () => {
      const markerElement = marker.getElement() as HTMLElement | null;
      if (!markerElement) return;
      markerElement.setAttribute('tabindex', '0');
      markerElement.setAttribute('role', 'button');
      markerElement.setAttribute('aria-label', `Ver detalhes de ${venue.name}`);
      markerElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openVenueDetail(venue, markerElement);
        }
      });
    });

    marker.addTo(markerLayer);
  });

  fitMapToVenues(filteredVenues);
}

function fitMapToVenues(filteredVenues: Venue[]) {
  if (!filteredVenues.length) {
    map.setView(initialCenter, 12, { animate: !reducedMotion });
    return;
  }

  if (filteredVenues.length === 1) {
    map.setView([Number(filteredVenues[0].lat), Number(filteredVenues[0].lng)], 14, {
      animate: !reducedMotion,
    });
    return;
  }

  const bounds = filteredVenues.map((venue) => [Number(venue.lat), Number(venue.lng)]) as LatLngBoundsExpression;
  map.fitBounds(bounds, {
    padding: [36, 36],
    maxZoom: 14,
    animate: !reducedMotion,
  });
}

function openVenueDetail(venue: Venue, trigger?: HTMLElement) {
  detailTrigger = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const directionsUrl = createDirectionsUrl(venue);
  const sourceUrl = safeExternalUrl(venue.source_url);

  dialogContent.innerHTML = `
    <div class="dialog-header">
      <div>
        <p class="dialog-neighborhood">${escapeHtml(venue.neighborhood)}</p>
        <h2 id="dialog-title">${escapeHtml(venue.name)}</h2>
      </div>
      <button class="dialog-close" type="button" aria-label="Fechar detalhes">×</button>
    </div>

    <div class="detail-address">
      <span>Endereço</span>
      <p>${escapeHtml(venue.address)}</p>
    </div>

    <dl class="detail-facts">
      <div>
        <dt>Quadras</dt>
        <dd>${formatCourtCount(venue.courts, true)}</dd>
      </div>
      <div>
        <dt>Cobertura</dt>
        <dd>${venue.indoor === true ? 'Coberta' : 'Aberta'}</dd>
      </div>
      <div>
        <dt>Acesso</dt>
        <dd>${formatAccessType(venue.access_type)}</dd>
      </div>
    </dl>

    <div class="detail-notes">
      <h3>Antes de ir</h3>
      <p>${venue.notes_pt ? escapeHtml(venue.notes_pt) : 'Não há observações adicionais para este local.'}</p>
    </div>

    <div class="dialog-actions">
      <a class="primary-button" href="${escapeAttribute(directionsUrl)}" target="_blank" rel="noopener noreferrer">
        Abrir rota no Google Maps
      </a>
      ${sourceUrl ? `
        <a class="secondary-button" href="${escapeAttribute(sourceUrl)}" target="_blank" rel="noopener noreferrer">
          Ver fonte do local
        </a>
      ` : '<p class="source-unavailable">Link da fonte não disponível.</p>'}
    </div>
  `;

  dialogContent.querySelector<HTMLButtonElement>('.dialog-close')?.addEventListener('click', () => dialog.close());

  if (!dialog.open) dialog.showModal();
  dialogContent.querySelector<HTMLButtonElement>('.dialog-close')?.focus();
}

function renderError() {
  setControlsEnabled(false);
  resultCount.textContent = 'Não foi possível carregar as quadras';
  mapSummary.textContent = 'Dados indisponíveis no momento';
  directory.innerHTML = `
    <div class="status-state error-state" role="alert">
      <span class="status-symbol" aria-hidden="true">!</span>
      <div>
        <strong>As quadras não carregaram</strong>
        <p>Confira sua conexão e tente novamente. O mapa continua disponível para você se orientar.</p>
        <button class="primary-button" id="retry-load" type="button">Tentar novamente</button>
      </div>
    </div>
  `;
  getElement<HTMLButtonElement>('retry-load').addEventListener('click', () => void loadVenues());
}

function formatVenueCount(count: number) {
  return `${count} ${count === 1 ? 'quadra encontrada' : 'quadras encontradas'}`;
}

function formatCourtCount(courts: number | null, detail = false) {
  const numberOfCourts = Number(courts);
  if (!Number.isFinite(numberOfCourts) || numberOfCourts <= 0) {
    return detail ? 'Não informado' : 'Nº de quadras não informado';
  }
  return `${numberOfCourts} ${numberOfCourts === 1 ? 'quadra' : 'quadras'}`;
}

function formatAccessType(accessType: string) {
  const labels: Record<string, string> = {
    reserva_e_aulas: 'Reserva e aulas',
    locacao_e_aulas: 'Locação e aulas',
    locacao_por_hora: 'Locação por hora',
    acesso_livre: 'Acesso livre',
    socios_e_convidados: 'Sócios e convidados',
  };

  if (labels[accessType]) return labels[accessType];
  return accessType
    ? accessType.replaceAll('_', ' ').replace(/^./, (letter) => letter.toLocaleUpperCase('pt-BR'))
    : 'Não informado';
}

function createDirectionsUrl(venue: Venue) {
  const destination = `${venue.address} (${Number(venue.lat)}, ${Number(venue.lng)})`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
