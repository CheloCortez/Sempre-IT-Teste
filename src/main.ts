import L, { type LatLngBoundsExpression, type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { pb } from './pocketbase';

type VenueCoverageStatus = 'coberta' | 'aberta' | 'nao_confirmada';
type Coverage = 'all' | 'indoor' | 'outdoor';
type CrowdLevel = 'vazia' | 'moderada' | 'cheia';
type SkillRange = 'iniciante' | 'intermediario' | 'avancado' | 'misto';

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
  coverage_status?: string | null;
  access_type: string;
  notes_pt: string;
  source_url: string;
  active: boolean;
}

interface Checkin {
  id: string;
  venue: string;
  players_now: number;
  crowd_level: CrowdLevel;
  skill_range: SkillRange;
  wait_minutes?: number | null;
  display_name?: string;
  note?: string;
  created?: string;
}

interface ActivitySnapshot {
  checkin: Checkin;
  timestamp: number;
}

interface BusyPeriod {
  weekday: string;
  weekdayIndex: number;
  hour: number;
  averagePlayers: number;
  sampleCount: number;
}

const coveragePresentation: Record<VenueCoverageStatus, {
  label: string;
  className: string;
  markerColor: string;
}> = {
  coberta: {
    label: 'Coberta',
    className: 'is-indoor',
    markerColor: '#086c55',
  },
  aberta: {
    label: 'Aberta',
    className: 'is-outdoor',
    markerColor: '#2d55a2',
  },
  nao_confirmada: {
    label: 'Cobertura a confirmar',
    className: 'is-unconfirmed',
    markerColor: '#8b5d10',
  },
};

const skillLabels: Record<SkillRange, string> = {
  iniciante: 'iniciante',
  intermediario: 'intermediário',
  avancado: 'avançado',
  misto: 'nível misto',
};

const crowdLabels: Record<CrowdLevel, string> = {
  vazia: 'vazia',
  moderada: 'movimento moderado',
  cheia: 'cheia',
};

const weekdayOrder: Record<string, number> = {
  domingo: 0,
  'segunda-feira': 1,
  'terça-feira': 2,
  'quarta-feira': 3,
  'quinta-feira': 4,
  'sexta-feira': 5,
  sábado: 6,
};

const ACTIVE_WINDOW_MS = 90 * 60 * 1000;
const COOLDOWN_MS = 10 * 60 * 1000;
const COOLDOWN_STORAGE_PREFIX = 'pickleworld-checkin:';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const initialCenter: L.LatLngExpression = [-23.612, -46.689];
const saoPauloBucketFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  hour: '2-digit',
  hourCycle: 'h23',
});

let map: LeafletMap;
let markerLayer: L.LayerGroup;
let venues: Venue[] = [];
let checkins: Checkin[] = [];
let selectedNeighborhood = 'all';
let selectedCoverage: Coverage = 'all';
let detailTrigger: HTMLElement | null = null;
let openVenueId: string | null = null;
let cooldownTimer: number | null = null;
let activityDataAvailable = true;

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
      <p class="intro-copy">Explore espaços da região de lançamento, veja relatos recentes de movimento e abra a rota sem perder tempo.</p>
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
void loadData();

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
    clearCooldownTimer();
    openVenueId = null;
    detailTrigger?.focus();
    detailTrigger = null;
  });
}

async function loadData() {
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

    try {
      await refreshCheckins(false);
    } catch (error) {
      activityDataAvailable = false;
      console.error('Falha ao carregar atividade:', error);
    }

    setControlsEnabled(true);
    renderResults();
  } catch (error) {
    console.error('Falha ao carregar locais:', error);
    renderError();
  } finally {
    directory.setAttribute('aria-busy', 'false');
  }
}

async function refreshCheckins(render = true) {
  const knownCreated = new Map(checkins.map((checkin) => [checkin.id, checkin.created]));
  const records = await pb.collection('checkins').getFullList<Checkin>({
    requestKey: 'all-checkins',
  });
  checkins = records
    .filter((checkin) => Boolean(checkin.id && checkin.venue))
    .map((checkin) => checkin.created ? checkin : { ...checkin, created: knownCreated.get(checkin.id) });
  activityDataAvailable = true;
  if (render) renderResults();
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
    const coverageStatus = getCoverageStatus(venue);
    const matchesCoverage =
      selectedCoverage === 'all' ||
      (selectedCoverage === 'indoor' && coverageStatus === 'coberta') ||
      (selectedCoverage === 'outdoor' && coverageStatus === 'aberta');

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

  directory.innerHTML = filteredVenues.map((venue) => {
    const activity = getCurrentActivity(venue.id);
    return `
      <article class="venue-card" data-venue-id="${escapeAttribute(venue.id)}">
        <button class="venue-card-button" type="button" aria-label="Ver detalhes de ${escapeAttribute(venue.name)}">
          <span class="venue-card-topline">
            <span class="neighborhood">${escapeHtml(venue.neighborhood)}</span>
            <span class="coverage-tag ${getCoveragePresentation(venue).className}">
              ${getCoveragePresentation(venue).label}
            </span>
          </span>
          <span class="venue-name">${escapeHtml(venue.name)}</span>
          <span class="venue-address">${escapeHtml(venue.address)}</span>
          ${renderDirectoryActivity(activity)}
          <span class="venue-meta">
            <span>${formatCourtCount(venue.courts)}</span>
            <span aria-hidden="true">·</span>
            <span>${formatAccessType(venue.access_type)}</span>
          </span>
          <span class="card-action">Ver detalhes <span aria-hidden="true">→</span></span>
        </button>
      </article>
    `;
  }).join('');

  directory.querySelectorAll<HTMLButtonElement>('.venue-card-button').forEach((button) => {
    button.addEventListener('click', () => {
      const venueId = button.closest<HTMLElement>('[data-venue-id]')?.dataset.venueId;
      const venue = venues.find((item) => item.id === venueId);
      if (venue) openVenueDetail(venue, button);
    });
  });
}

function renderDirectoryActivity(activity: ActivitySnapshot | null) {
  if (!activity) {
    const label = activityDataAvailable ? 'Sem relato nos últimos 90 min' : 'Atividade indisponível agora';
    return `<span class="venue-activity is-quiet"><span class="activity-dot" aria-hidden="true"></span>${label}</span>`;
  }

  return `
    <span class="venue-activity is-live">
      <span class="activity-dot" aria-hidden="true"></span>
      <strong>${formatPlayerCount(activity.checkin.players_now)}</strong>
      <span>· ${escapeHtml(skillLabels[activity.checkin.skill_range])} · ${formatRelativeTime(activity.timestamp)}</span>
    </span>
  `;
}

function renderMarkers(filteredVenues: Venue[]) {
  markerLayer.clearLayers();

  filteredVenues.forEach((venue) => {
    const coverage = getCoveragePresentation(venue);
    const activity = getCurrentActivity(venue.id);
    const markerLabel = activity
      ? `${venue.name}. ${formatPlayerCount(activity.checkin.players_now)}, ${skillLabels[activity.checkin.skill_range]}, relato ${formatRelativeTime(activity.timestamp)}.`
      : `${venue.name}. ${coverage.label}. Sem atividade recente.`;
    const marker = L.marker([Number(venue.lat), Number(venue.lng)], {
      icon: L.divIcon({
        className: 'venue-map-icon',
        html: `
          <span class="map-marker ${activity ? 'has-activity' : ''}" style="--marker-color: ${coverage.markerColor}">
            <span class="marker-core" aria-hidden="true"></span>
            ${activity ? `<span class="marker-count" aria-hidden="true">${formatMarkerCount(activity.checkin.players_now)}</span>` : ''}
          </span>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
      bubblingMouseEvents: false,
      keyboard: false,
    });

    marker.bindTooltip(markerLabel, {
      direction: 'top',
      offset: [0, -18],
      opacity: 1,
    });

    marker.on('click', () => openVenueDetail(venue, (marker.getElement() as HTMLElement | null) ?? undefined));
    marker.on('add', () => {
      const markerElement = marker.getElement() as HTMLElement | null;
      if (!markerElement) return;
      markerElement.setAttribute('tabindex', '0');
      markerElement.setAttribute('role', 'button');
      markerElement.setAttribute('aria-label', `Ver detalhes de ${markerLabel}`);
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
  openVenueId = venue.id;
  renderVenueDetail(venue);
  if (!dialog.open) dialog.showModal();
  dialogContent.querySelector<HTMLButtonElement>('.dialog-close')?.focus();
}

function renderVenueDetail(venue: Venue, formMessage?: { type: 'success' | 'error'; text: string }) {
  clearCooldownTimer();
  const directionsUrl = createDirectionsUrl(venue);
  const sourceUrl = safeExternalUrl(venue.source_url);
  const coverage = getCoveragePresentation(venue);
  const activity = getCurrentActivity(venue.id);
  const busyPeriods = getBusyPeriods(venue.id);
  const cooldownRemaining = getCooldownRemaining(venue.id);

  dialogContent.innerHTML = `
    <div class="dialog-header">
      <div>
        <p class="dialog-neighborhood">${escapeHtml(venue.neighborhood)}</p>
        <h2 id="dialog-title">${escapeHtml(venue.name)}</h2>
      </div>
      <button class="dialog-close" type="button" aria-label="Fechar detalhes">×</button>
    </div>

    ${renderDetailActivity(activity)}

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
        <dd>${coverage.label}</dd>
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

    ${renderBusyPeriods(busyPeriods)}
    ${renderCheckinForm(venue, cooldownRemaining, formMessage)}

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
  dialogContent.querySelector<HTMLFormElement>('#checkin-form')?.addEventListener('submit', (event) => {
    void submitCheckin(event, venue);
  });
  startCooldownTicker(venue.id);
}

function renderDetailActivity(activity: ActivitySnapshot | null) {
  if (!activity) {
    const copy = activityDataAvailable
      ? 'Ainda não há relato feito nos últimos 90 minutos. Envie um check-in se você estiver no local.'
      : 'Não foi possível consultar os relatos agora. Tente novamente em instantes.';
    return `
      <section class="current-activity is-quiet" aria-labelledby="current-activity-title">
        <div class="activity-heading">
          <h3 id="current-activity-title">Atividade agora</h3>
          <span>Sem relato recente</span>
        </div>
        <p>${copy}</p>
      </section>
    `;
  }

  const wait = Number(activity.checkin.wait_minutes);
  return `
    <section class="current-activity is-live" aria-labelledby="current-activity-title">
      <div class="activity-heading">
        <h3 id="current-activity-title">Atividade agora</h3>
        <span>${formatRelativeTime(activity.timestamp)}</span>
      </div>
      <p class="activity-lead"><strong>${formatPlayerCount(activity.checkin.players_now)}</strong> · ${escapeHtml(crowdLabels[activity.checkin.crowd_level])}</p>
      <p>Nível relatado: <strong>${escapeHtml(skillLabels[activity.checkin.skill_range])}</strong>${Number.isFinite(wait) && wait > 0 ? ` · espera de ${Math.round(wait)} min` : ''}.</p>
      ${activity.checkin.note ? `<blockquote>“${escapeHtml(activity.checkin.note)}”${activity.checkin.display_name ? `<cite> — ${escapeHtml(activity.checkin.display_name)}</cite>` : ''}</blockquote>` : ''}
    </section>
  `;
}

function renderBusyPeriods(periods: BusyPeriod[]) {
  if (!periods.length) {
    return `
      <section class="busy-periods" aria-labelledby="busy-periods-title">
        <div class="section-heading-row">
          <h3 id="busy-periods-title">Quando costuma movimentar</h3>
          <span>Horário de São Paulo</span>
        </div>
        <div class="pattern-empty">
          <strong>Ainda não há relatos suficientes</strong>
          <p>Mostraremos um padrão quando houver pelo menos 3 relatos na mesma faixa de dia e hora, com uma base mínima de 6 relatos válidos.</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="busy-periods" aria-labelledby="busy-periods-title">
      <div class="section-heading-row">
        <h3 id="busy-periods-title">Quando costuma movimentar</h3>
        <span>Horário de São Paulo</span>
      </div>
      <p class="pattern-rationale">Faixas com pelo menos 3 relatos, ordenadas pela média de jogadores observada. É um histórico da comunidade, não uma garantia.</p>
      <ul class="period-list">
        ${periods.map((period) => `
          <li>
            <span><strong>${capitalize(period.weekday)}</strong>, ${String(period.hour).padStart(2, '0')}:00–${String((period.hour + 1) % 24).padStart(2, '0')}:00</span>
            <span>${formatAveragePlayers(period.averagePlayers)} · ${period.sampleCount} relatos</span>
          </li>
        `).join('')}
      </ul>
    </section>
  `;
}

function renderCheckinForm(
  venue: Venue,
  cooldownRemaining: number,
  formMessage?: { type: 'success' | 'error'; text: string },
) {
  const cooldownActive = cooldownRemaining > 0;
  return `
    <section class="checkin-section" aria-labelledby="checkin-title">
      <div class="checkin-intro">
        <div>
          <h3 id="checkin-title">Conte como está agora</h3>
          <p>Seu relato anônimo ajuda quem está escolhendo onde jogar. Campos com * são obrigatórios.</p>
        </div>
        <span class="checkin-window">Vale por 90 min</span>
      </div>

      <form id="checkin-form" novalidate data-venue-id="${escapeAttribute(venue.id)}">
        <div class="form-grid">
          <label class="form-field">
            <span>Jogadores agora *</span>
            <input id="players-now" name="players_now" type="number" min="0" max="100" step="1" inputmode="numeric" required aria-describedby="players-help">
            <small id="players-help">Inclua quem está em quadra e esperando para jogar.</small>
          </label>

          <label class="form-field">
            <span>Espera em minutos</span>
            <input name="wait_minutes" type="number" min="0" max="240" step="1" inputmode="numeric" placeholder="0">
          </label>
        </div>

        <fieldset class="choice-field">
          <legend>Movimento *</legend>
          <div class="choice-options">
            ${renderRadioOption('crowd_level', 'vazia', 'Vazia', true)}
            ${renderRadioOption('crowd_level', 'moderada', 'Moderada')}
            ${renderRadioOption('crowd_level', 'cheia', 'Cheia')}
          </div>
        </fieldset>

        <fieldset class="choice-field">
          <legend>Nível de quem está jogando *</legend>
          <div class="choice-options skill-options">
            ${renderRadioOption('skill_range', 'iniciante', 'Iniciante', true)}
            ${renderRadioOption('skill_range', 'intermediario', 'Intermediário')}
            ${renderRadioOption('skill_range', 'avancado', 'Avançado')}
            ${renderRadioOption('skill_range', 'misto', 'Misto')}
          </div>
        </fieldset>

        <div class="form-grid">
          <label class="form-field">
            <span>Seu nome <em>opcional</em></span>
            <input name="display_name" type="text" maxlength="40" autocomplete="nickname" placeholder="Como quer aparecer">
          </label>

          <label class="form-field form-field-wide">
            <span>Nota curta <em>opcional</em></span>
            <textarea name="note" maxlength="160" rows="3" placeholder="Ex.: duas quadras livres"></textarea>
          </label>
        </div>

        <div id="checkin-status" class="form-status ${formMessage ? `is-${formMessage.type}` : ''}" role="status" aria-live="polite" tabindex="-1">
          ${formMessage ? escapeHtml(formMessage.text) : ''}
        </div>

        <div class="submit-row">
          <button class="primary-button checkin-submit" type="submit" ${cooldownActive ? 'disabled' : ''}>
            ${cooldownActive ? `Novo relato em ${formatCooldown(cooldownRemaining)}` : 'Enviar relato agora'}
          </button>
          <p id="cooldown-copy">${cooldownActive ? 'Você já enviou um relato aqui. Aguarde 10 minutos para enviar outro.' : 'Sem cadastro. Um novo envio neste local fica disponível após 10 minutos.'}</p>
        </div>
      </form>
    </section>
  `;
}

function renderRadioOption(name: string, value: string, label: string, required = false) {
  const id = `checkin-${name}-${value}`;
  return `
    <label for="${id}">
      <input id="${id}" type="radio" name="${name}" value="${value}" ${required ? 'required' : ''}>
      <span>${label}</span>
    </label>
  `;
}

async function submitCheckin(event: SubmitEvent, venue: Venue) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  if (!form.reportValidity()) return;

  const cooldownRemaining = getCooldownRemaining(venue.id);
  if (cooldownRemaining > 0) {
    setFormStatus('error', `Aguarde ${formatCooldown(cooldownRemaining)} para enviar outro relato neste local.`);
    applyCooldownState(cooldownRemaining);
    return;
  }

  const submitButton = form.querySelector<HTMLButtonElement>('.checkin-submit');
  const controls = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input, textarea, button');
  controls.forEach((control) => { control.disabled = true; });
  if (submitButton) submitButton.textContent = 'Enviando relato…';
  setFormStatus('', '');

  const data = new FormData(form);
  const players = Number(data.get('players_now'));
  const waitValue = String(data.get('wait_minutes') ?? '').trim();
  const payload: Record<string, string | number> = {
    venue: venue.id,
    players_now: players,
    crowd_level: String(data.get('crowd_level')),
    skill_range: String(data.get('skill_range')),
  };

  if (waitValue) payload.wait_minutes = Number(waitValue);
  const displayName = String(data.get('display_name') ?? '').trim();
  const note = String(data.get('note') ?? '').trim();
  if (displayName) payload.display_name = displayName;
  if (note) payload.note = note;

  try {
    const created = await pb.collection('checkins').create<Checkin>(payload, { requestKey: null });
    const createdWithTimestamp = created.created ? created : { ...created, created: new Date().toISOString() };
    checkins = [createdWithTimestamp, ...checkins.filter((checkin) => checkin.id !== created.id)];
    setCooldown(venue.id);

    try {
      await refreshCheckins(false);
    } catch (refreshError) {
      console.error('Falha ao atualizar relatos após o envio:', refreshError);
      checkins = [createdWithTimestamp, ...checkins.filter((checkin) => checkin.id !== created.id)];
    }

    renderResults();
    const currentVenue = venues.find((item) => item.id === openVenueId);
    if (currentVenue) {
      renderVenueDetail(currentVenue, { type: 'success', text: 'Relato enviado. A atividade foi atualizada para todo mundo.' });
      dialogContent.querySelector<HTMLElement>('#checkin-status')?.focus();
    }
  } catch (error) {
    controls.forEach((control) => { control.disabled = false; });
    if (isCooldownError(error)) {
      setCooldown(venue.id);
      applyCooldownState(COOLDOWN_MS);
      startCooldownTicker(venue.id);
    } else if (submitButton) {
      submitButton.textContent = 'Enviar relato agora';
    }
    setFormStatus('error', getCheckinErrorMessage(error));
  }
}

function setFormStatus(type: '' | 'success' | 'error', message: string) {
  const status = dialogContent.querySelector<HTMLElement>('#checkin-status');
  if (!status) return;
  status.className = `form-status${type ? ` is-${type}` : ''}`;
  status.textContent = message;
  if (type === 'error') status.setAttribute('role', 'alert');
  else status.setAttribute('role', 'status');
}

function getCheckinErrorMessage(error: unknown) {
  const candidate = error as { status?: number };
  if (isCooldownError(error)) {
    return 'Um relato foi enviado há pouco para este local. Aguarde 10 minutos antes de tentar novamente.';
  }

  if (candidate?.status === 400) {
    return 'Confira os campos do relato e tente novamente. Jogadores, movimento e nível são obrigatórios.';
  }

  return 'Não foi possível enviar agora. Verifique sua conexão e tente novamente.';
}

function isCooldownError(error: unknown) {
  const candidate = error as { status?: number; message?: string; data?: { message?: string; data?: Record<string, { message?: string }> } };
  const combinedMessage = [
    candidate?.message,
    candidate?.data?.message,
    ...Object.values(candidate?.data?.data ?? {}).map((item) => item?.message),
  ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
  return candidate?.status === 429 || /cooldown|aguarde|recent|muitas|too many|rate/.test(combinedMessage);
}

function getCurrentActivity(venueId: string): ActivitySnapshot | null {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  let newest: ActivitySnapshot | null = null;

  for (const checkin of checkins) {
    if (checkin.venue !== venueId || !isValidActivityCheckin(checkin)) continue;
    const timestamp = parseCreatedTimestamp(checkin.created);
    if (timestamp === null || timestamp < cutoff || timestamp > Date.now() + 60_000) continue;
    if (!newest || timestamp > newest.timestamp) newest = { checkin, timestamp };
  }

  return newest;
}

function getBusyPeriods(venueId: string): BusyPeriod[] {
  const buckets = new Map<string, { weekday: string; weekdayIndex: number; hour: number; players: number[] }>();
  let validReportCount = 0;

  for (const checkin of checkins) {
    if (checkin.venue !== venueId || !isValidActivityCheckin(checkin)) continue;
    const timestamp = parseCreatedTimestamp(checkin.created);
    if (timestamp === null || timestamp > Date.now() + 60_000) continue;
    const bucket = getSaoPauloBucket(timestamp);
    if (!bucket) continue;
    validReportCount += 1;
    const key = `${bucket.weekdayIndex}-${bucket.hour}`;
    const existing = buckets.get(key) ?? { ...bucket, players: [] };
    existing.players.push(Number(checkin.players_now));
    buckets.set(key, existing);
  }

  if (validReportCount < 6) return [];

  return [...buckets.values()]
    .filter((bucket) => bucket.players.length >= 3)
    .map((bucket) => ({
      weekday: bucket.weekday,
      weekdayIndex: bucket.weekdayIndex,
      hour: bucket.hour,
      averagePlayers: bucket.players.reduce((sum, players) => sum + players, 0) / bucket.players.length,
      sampleCount: bucket.players.length,
    }))
    .sort((a, b) => b.averagePlayers - a.averagePlayers || b.sampleCount - a.sampleCount || a.weekdayIndex - b.weekdayIndex || a.hour - b.hour)
    .slice(0, 4);
}

function getSaoPauloBucket(timestamp: number) {
  const parts = saoPauloBucketFormatter.formatToParts(new Date(timestamp));
  const weekday = parts.find((part) => part.type === 'weekday')?.value.toLocaleLowerCase('pt-BR');
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  if (!weekday || weekdayOrder[weekday] === undefined || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return { weekday, weekdayIndex: weekdayOrder[weekday], hour };
}

function isValidActivityCheckin(checkin: Checkin) {
  const players = Number(checkin.players_now);
  return Number.isFinite(players) && players >= 0 && players <= 100 &&
    checkin.crowd_level in crowdLabels && checkin.skill_range in skillLabels;
}

function parseCreatedTimestamp(value?: string) {
  if (!value || typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getCooldownRemaining(venueId: string) {
  try {
    const stored = window.localStorage.getItem(`${COOLDOWN_STORAGE_PREFIX}${venueId}`);
    if (!stored) return 0;
    const timestamp = Number(stored);
    if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60_000) {
      window.localStorage.removeItem(`${COOLDOWN_STORAGE_PREFIX}${venueId}`);
      return 0;
    }
    return Math.max(0, COOLDOWN_MS - (Date.now() - timestamp));
  } catch {
    return 0;
  }
}

function setCooldown(venueId: string) {
  try {
    window.localStorage.setItem(`${COOLDOWN_STORAGE_PREFIX}${venueId}`, String(Date.now()));
  } catch {
    // Storage can be unavailable in private browsing; server validation remains authoritative.
  }
}

function startCooldownTicker(venueId: string) {
  clearCooldownTimer();
  applyCooldownState(getCooldownRemaining(venueId));
  cooldownTimer = window.setInterval(() => {
    const remaining = getCooldownRemaining(venueId);
    applyCooldownState(remaining);
    if (remaining <= 0) clearCooldownTimer();
  }, 1000);
}

function applyCooldownState(remaining: number) {
  const submitButton = dialogContent.querySelector<HTMLButtonElement>('.checkin-submit');
  const copy = dialogContent.querySelector<HTMLElement>('#cooldown-copy');
  if (!submitButton || !copy) return;
  const active = remaining > 0;
  submitButton.disabled = active;
  submitButton.textContent = active ? `Novo relato em ${formatCooldown(remaining)}` : 'Enviar relato agora';
  copy.textContent = active
    ? 'Você já enviou um relato aqui. Aguarde 10 minutos para enviar outro.'
    : 'Sem cadastro. Um novo envio neste local fica disponível após 10 minutos.';
}

function clearCooldownTimer() {
  if (cooldownTimer !== null) window.clearInterval(cooldownTimer);
  cooldownTimer = null;
}

function formatCooldown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatRelativeTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'agora mesmo';
  if (minutes === 1) return 'há 1 min';
  return `há ${minutes} min`;
}

function formatPlayerCount(value: number) {
  const count = Math.max(0, Math.round(Number(value)));
  return `${count} ${count === 1 ? 'jogador' : 'jogadores'}`;
}

function formatAveragePlayers(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `média de ${rounded.toLocaleString('pt-BR')} ${rounded === 1 ? 'jogador' : 'jogadores'}`;
}

function formatMarkerCount(value: number) {
  const count = Math.max(0, Math.round(Number(value)));
  return count > 99 ? '99+' : String(count);
}

function capitalize(value: string) {
  return value.replace(/^./u, (letter) => letter.toLocaleUpperCase('pt-BR'));
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
  getElement<HTMLButtonElement>('retry-load').addEventListener('click', () => void loadData());
}

function getCoverageStatus(venue: Venue): VenueCoverageStatus {
  if (venue.coverage_status === 'coberta' || venue.coverage_status === 'aberta') {
    return venue.coverage_status;
  }
  return 'nao_confirmada';
}

function getCoveragePresentation(venue: Venue) {
  const status = getCoverageStatus(venue);
  return { status, ...coveragePresentation[status] };
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

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value: unknown) {
  return escapeHtml(value);
}
