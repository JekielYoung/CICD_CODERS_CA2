// public/js/home.js
// Home page: greeting, trip counts, filter / sort / search, and the trip cards.
// Data: GET /api/auth/me  -> { user: { id, name, email } }
//       GET /api/trips    -> { trips: [{ trip_id, user_id, title, destination,
//                                         start_date, end_date, traveler_count, ... }] }
// Dates come from the API as 'YYYY-MM-DD' strings, so they can be compared as strings.
import { api } from './shared/api.js';

const $ = (id) => document.getElementById(id);

const grid = $('trip-grid');
const newTripCol = $('trip-new-col');
const emptyState = $('empty-state');
const searchInput = $('search');
const sortSelect = $('sort');
const filterButtons = document.querySelectorAll('[data-filter]');

// "My trips" or "Shared with me" (home.html?view=shared)
const view = new URLSearchParams(window.location.search).get('view') === 'shared' ? 'shared' : 'mine';

const state = {
  me: null,
  trips: [],      // trips for the current view
  filter: 'upcoming',
  sort: 'start',
  search: '',
};

// ---------- date helpers ----------

// Today in the user's own time zone, as 'YYYY-MM-DD'
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Whole days from a to b (both 'YYYY-MM-DD')
function daysBetween(a, b) {
  const toUTC = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-12-14', '2026-12-18' -> '14 – 18 Dec 2026 · 5 days'
function formatRange(start, end) {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  let range;
  if (start === end) range = `${sd} ${MONTHS[sm - 1]} ${sy}`;
  else if (sy === ey && sm === em) range = `${sd} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  else if (sy === ey) range = `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  else range = `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  const days = daysBetween(start, end) + 1;
  return `${range} · ${days} ${days === 1 ? 'day' : 'days'}`;
}

// Badge on the cover: 'In 27 days', 'Tomorrow', 'Starts today', 'In progress', 'Ended'
function statusLabel(trip, today) {
  if (trip.end_date < today) return 'Ended';
  if (trip.start_date <= today) return 'In progress';
  const n = daysBetween(today, trip.start_date);
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}

const isPast = (trip, today) => trip.end_date < today;

// 'John Doe' -> 'JD', 'john' -> 'J'
function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function greetingFor(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// ---------- rendering ----------

function renderUser() {
  const { name } = state.me;
  const firstName = name.trim().split(/\s+/)[0];
  $('user-name').textContent = firstName;
  $('user-initials').textContent = initials(name);
  $('greeting').textContent = `${greetingFor(new Date().getHours())}, ${firstName}`;
}

function renderSubtitle() {
  const today = todayISO();
  const upcoming = state.trips
    .filter((t) => !isPast(t, today))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const sub = $('greeting-sub');

  if (view === 'shared') {
    sub.textContent = upcoming.length
      ? `${upcoming.length} upcoming ${upcoming.length === 1 ? 'trip has' : 'trips have'} been shared with you.`
      : 'Trips other people add you to will show up here.';
    return;
  }
  if (!upcoming.length) {
    sub.textContent = 'No upcoming trips yet. Start one to begin planning.';
    return;
  }
  const next = upcoming[0];
  const count = `You have ${upcoming.length} upcoming ${upcoming.length === 1 ? 'trip' : 'trips'}.`;
  if (next.start_date <= today) {
    sub.textContent = `${count} ${next.title} is happening now.`;
  } else {
    const n = daysBetween(today, next.start_date);
    sub.textContent = `${count} The next one starts ${n === 1 ? 'tomorrow' : `in ${n} days`}.`;
  }
}

function renderCounts() {
  const today = todayISO();
  const past = state.trips.filter((t) => isPast(t, today)).length;
  $('count-upcoming').textContent = state.trips.length - past;
  $('count-past').textContent = past;
}

// Builds one card with DOM methods and textContent, so trip names typed by users
// can never inject HTML into the page.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function tripCard(trip, today) {
  const col = el('div', 'col');
  const card = el('article', 'card h-100');

  const cover = el('div', 'trip-cover');
  cover.append(el('span', 'badge rounded-pill text-bg-light border', statusLabel(trip, today)));
  if (view === 'shared' || trip.user_id !== state.me.id) {
    cover.append(el('span', 'trip-cover__label', 'Shared with you'));
  }

  const body = el('div', 'card-body d-flex flex-column');
  body.append(
    el('h3', 'h5 card-title', trip.title),
    el('p', 'text-secondary small mb-1', trip.destination),
    el('p', 'text-secondary small mb-3', formatRange(trip.start_date, trip.end_date)),
  );

  const footer = el('div', 'd-flex justify-content-between align-items-center mt-auto');
  const count = Number(trip.traveler_count) || 1;
  footer.append(el('span', 'small text-secondary', `${count} ${count === 1 ? 'traveller' : 'travellers'}`));
  const open = el('a', 'fw-semibold link-dark stretched-link', 'Open →');
  open.href = `itinerary.html?tripId=${encodeURIComponent(trip.trip_id)}`;
  open.setAttribute('aria-label', `Open ${trip.title}`);
  footer.append(open);
  body.append(footer);

  card.append(cover, body);
  col.append(card);
  return col;
}

function visibleTrips() {
  const today = todayISO();
  const q = state.search.trim().toLowerCase();

  let list = state.trips.filter((t) => {
    if (state.filter === 'upcoming' && isPast(t, today)) return false;
    if (state.filter === 'past' && !isPast(t, today)) return false;
    if (q && !`${t.title} ${t.destination}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (state.sort === 'name') {
    list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  } else if (state.filter === 'past') {
    // Most recent past trip first
    list.sort((a, b) => b.start_date.localeCompare(a.start_date));
  } else {
    // Soonest first
    list.sort((a, b) => a.start_date.localeCompare(b.start_date));
  }
  return list;
}

function renderGrid() {
  const today = todayISO();
  const list = visibleTrips();

  // Remove old trip cards but keep the static "New trip" card
  [...grid.children].forEach((child) => {
    if (child !== newTripCol) child.remove();
  });
  // "New trip" only makes sense on My trips
  newTripCol.hidden = view === 'shared';

  list.forEach((trip) => grid.append(tripCard(trip, today)));

  if (list.length) {
    emptyState.hidden = true;
    return;
  }
  // Nothing to show: say why, except for a brand-new user on My trips,
  // where the "New trip" card already says what to do.
  if (state.search.trim()) {
    emptyState.textContent = `No trips match "${state.search.trim()}".`;
  } else if (view === 'shared' && !state.trips.length) {
    emptyState.textContent = 'No trips have been shared with you yet.';
  } else if (state.filter === 'past') {
    emptyState.textContent = 'No past trips.';
  } else if (state.filter === 'upcoming' && state.trips.length) {
    emptyState.textContent = 'No upcoming trips.';
  } else if (view === 'shared') {
    emptyState.textContent = 'No trips found.';
  } else {
    emptyState.hidden = true;
    return;
  }
  emptyState.hidden = false;
}

function renderFilterButtons() {
  filterButtons.forEach((btn) => {
    const active = btn.dataset.filter === state.filter;
    btn.classList.toggle('btn-dark', active);
    btn.classList.toggle('btn-outline-dark', !active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function renderNav() {
  document.querySelectorAll('#topbar-menu .nav-link').forEach((link) => {
    const isShared = link.getAttribute('href').includes('view=shared');
    const active = (view === 'shared') === isShared;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (view === 'shared') document.title = 'Shared with me · Orbit';
}

// ---------- events ----------

filterButtons.forEach((btn) =>
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    renderFilterButtons();
    renderGrid();
  }),
);

sortSelect.addEventListener('change', () => {
  state.sort = sortSelect.value;
  renderGrid();
});

searchInput.addEventListener('input', () => {
  state.search = searchInput.value;
  renderGrid();
});

// Pressing Enter in the search box should not reload the page
searchInput.form.addEventListener('submit', (e) => e.preventDefault());

// ---------- start ----------

async function init() {
  renderNav();
  renderFilterButtons();
  try {
    const [meRes, tripsRes] = await Promise.all([api('/auth/me'), api('/trips')]);
    if (!meRes || !tripsRes) return; // api.js is already redirecting to login

    state.me = meRes.user;
    const all = tripsRes.trips || [];
    state.trips = all.filter((t) =>
      view === 'shared' ? t.user_id !== state.me.id : t.user_id === state.me.id,
    );

    renderUser();
    renderSubtitle();
    renderCounts();
    renderGrid();
  } catch (err) {
    emptyState.textContent = err.status === 0
      ? err.message
      : 'Could not load your trips. Please refresh the page to try again.';
    emptyState.hidden = false;
  }
}

init();