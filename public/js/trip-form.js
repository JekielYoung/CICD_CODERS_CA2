// public/js/trip-form.js
// New trip form.
//   1. POST /api/trips  { title, destination, start_date, end_date, travelers }  -> 201 { trip_id }
//      (the database trigger adds the signed-in user as the Owner in trip_member)
//   2. POST /api/trips/:tripId/members  { email }  once per traveller added
//   3. Go to itinerary.html?tripId=<id>
//
// Step 2 runs after the trip exists, so an email with no Orbit account cannot stop the
// trip being created. If any traveller fails, the page lists them and offers a link
// to the trip instead of redirecting.
//
// Edit mode (?tripId=<id>) needs a PATCH /api/trips/:tripId route, which the server
// does not have yet, so the page says so instead of pretending to save.
import { api } from './shared/api.js';

const $ = (id) => document.getElementById(id);

const form = $('trip-form');
const nameInput = $('trip-name');
const destInput = $('trip-destination');
const startInput = $('trip-start');
const endInput = $('trip-end');
const dayCount = $('day-count');
const emailInput = $('traveller-email');
const addBtn = $('add-traveller');
const travellerList = $('traveller-list');
const submitBtn = $('submit-btn');
const formAlert = $('error-form');

const params = new URLSearchParams(window.location.search);
const MAX_TRAVELLERS = 100; // matches the traveler_count check in schema.sql
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let me = null;
const emails = []; // travellers added on this page, lowercase

// ---------- helpers ----------

function initials(nameOrEmail) {
  return String(nameOrEmail || '?')
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// Inclusive day count, or null when the dates are missing or the wrong way round
function tripDays(start, end) {
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || end < start) return null;
  const toUTC = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(end) - toUTC(start)) / 86400000) + 1;
}

// A real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-31)
function isValidDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Bootstrap shows .invalid-feedback when its sibling input has .is-invalid
function fieldError(input, feedbackId, message) {
  input.classList.add('is-invalid');
  $(feedbackId).textContent = message;
}

function clearErrors() {
  form.querySelectorAll('.is-invalid').forEach((node) => node.classList.remove('is-invalid'));
  formAlert.hidden = true;
  formAlert.replaceChildren();
}

function showAlert(...parts) {
  formAlert.replaceChildren(...parts);
  formAlert.hidden = false;
}

// ---------- day count ----------

function updateDayCount() {
  // The end date cannot be picked before the start date
  endInput.min = startInput.value || '';
  const days = tripDays(startInput.value, endInput.value);
  dayCount.textContent = days ? `${days} ${days === 1 ? 'day' : 'days'}` : '';
}

startInput.addEventListener('change', () => {
  // Moving the start past the end: move the end along with it
  if (endInput.value && startInput.value > endInput.value) endInput.value = startInput.value;
  updateDayCount();
});
endInput.addEventListener('change', updateDayCount);

// ---------- travellers ----------

function renderTravellers() {
  // Keep the first chip (the signed-in user), rebuild the rest
  [...travellerList.children].slice(1).forEach((li) => li.remove());

  emails.forEach((email) => {
    const li = document.createElement('li');
    li.className = 'chip';

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = initials(email);

    const label = document.createElement('span');
    label.textContent = email;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip__remove';
    remove.setAttribute('aria-label', `Remove ${email}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      emails.splice(emails.indexOf(email), 1);
      renderTravellers();
      emailInput.focus();
    });

    li.append(avatar, label, remove);
    travellerList.append(li);
  });
}

function addTraveller() {
  emailInput.classList.remove('is-invalid');
  const email = emailInput.value.trim().toLowerCase();

  if (!email) return fieldError(emailInput, 'error-traveller', 'Enter an email address.');
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return fieldError(emailInput, 'error-traveller', 'Enter a valid email address.');
  }
  if (me && email === me.email.toLowerCase()) {
    return fieldError(emailInput, 'error-traveller', 'You are already on this trip.');
  }
  if (emails.includes(email)) {
    return fieldError(emailInput, 'error-traveller', 'This person is already added.');
  }
  if (emails.length + 1 >= MAX_TRAVELLERS) {
    return fieldError(emailInput, 'error-traveller', `A trip can have at most ${MAX_TRAVELLERS} travellers.`);
  }

  emails.push(email);
  emailInput.value = '';
  renderTravellers();
  emailInput.focus();
}

addBtn.addEventListener('click', addTraveller);

// Enter in the email box adds the traveller instead of submitting the whole form
emailInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addTraveller();
  }
});

// ---------- validation ----------

// Same rules as tripController.create, checked here so each message
// appears under the right field (the server only sends { error }).
function validate() {
  let ok = true;
  const title = nameInput.value.trim();
  const destination = destInput.value.trim();
  const start = startInput.value;
  const end = endInput.value;

  if (!title) { fieldError(nameInput, 'error-name', 'Give your trip a name.'); ok = false; }
  else if (title.length > 100) { fieldError(nameInput, 'error-name', 'Trip name must be at most 100 characters.'); ok = false; }

  if (!destination) { fieldError(destInput, 'error-destination', 'Enter a destination.'); ok = false; }
  else if (destination.length > 100) { fieldError(destInput, 'error-destination', 'Destination must be at most 100 characters.'); ok = false; }

  // Both date inputs share one message box, under the end date
  if (!start || !end) {
    if (!start) startInput.classList.add('is-invalid');
    if (!end) endInput.classList.add('is-invalid');
    fieldError(endInput, 'error-dates', 'Choose a start and end date.');
    ok = false;
  } else if (!isValidDate(start) || !isValidDate(end)) {
    startInput.classList.toggle('is-invalid', !isValidDate(start));
    fieldError(endInput, 'error-dates', 'Enter valid dates.');
    ok = false;
  } else if (end < start) {
    startInput.classList.add('is-invalid');
    fieldError(endInput, 'error-dates', 'End date cannot be earlier than the start date.');
    ok = false;
  }

  // Typed an email but never pressed Add: don't silently drop it
  if (emailInput.value.trim()) {
    fieldError(emailInput, 'error-traveller', 'Press Add to include this traveller, or clear the box.');
    ok = false;
  }

  return ok ? { title, destination, start_date: start, end_date: end } : null;
}

// Puts a server 400 message under the field it is about, otherwise in the alert box
function showServerError(message) {
  if (/name/i.test(message)) fieldError(nameInput, 'error-name', message);
  else if (/destination/i.test(message)) fieldError(destInput, 'error-destination', message);
  else if (/date/i.test(message)) fieldError(endInput, 'error-dates', message);
  else showAlert(message);
}

// ---------- submit ----------

function setBusy(busy, label) {
  submitBtn.disabled = busy;
  submitBtn.textContent = label;
  form.querySelectorAll('input, button').forEach((node) => {
    if (node !== submitBtn) node.disabled = busy;
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const values = validate();
  if (!values) {
    form.querySelector('.is-invalid')?.focus();
    return;
  }

  setBusy(true, 'Creating trip...');

  // 1. Create the trip
  let tripId;
  try {
    const created = await api('/trips', {
      method: 'POST',
      body: { ...values, travelers: emails.length + 1 },
    });
    if (!created) return; // session ended, api.js is redirecting to login
    tripId = created.trip_id;
  } catch (err) {
    setBusy(false, 'Create trip');
    if (err.status === 400) showServerError(err.message);
    else showAlert(err.message || 'Could not create the trip. Please try again.');
    return;
  }

  const tripUrl = `itinerary.html?tripId=${encodeURIComponent(tripId)}`;

  // 2. Add travellers one by one, collecting the ones that fail
  const failed = [];
  for (const email of emails) {
    try {
      await api(`/trips/${tripId}/members`, { method: 'POST', body: { email } });
    } catch (err) {
      // 409 means they're already on the trip, which is what we wanted
      if (err.status !== 409) failed.push({ email, reason: err.message });
    }
  }

  // 3. All good: open the new trip
  if (!failed.length) {
    window.location.href = tripUrl;
    return;
  }

  // The trip exists now, so don't let the button create a second one
  submitBtn.textContent = 'Trip created';
  const list = document.createElement('ul');
  list.className = 'mb-2 ps-3';
  failed.forEach(({ email, reason }) => {
    const li = document.createElement('li');
    li.textContent = `${email}: ${reason}`;
    list.append(li);
  });
  const intro = document.createElement('p');
  intro.className = 'mb-1';
  intro.textContent = 'Your trip was created, but these travellers could not be added:';
  const link = document.createElement('a');
  link.href = tripUrl;
  link.className = 'alert-link';
  link.textContent = 'Go to your trip';
  const outro = document.createElement('p');
  outro.className = 'mb-0';
  outro.append(link, ' — you can invite them from there once they have an Orbit account.');
  showAlert(intro, list, outro);
});

// ---------- start ----------

// Values handed over by the quick-create form on home.html
function prefillFromQuery() {
  const destination = params.get('destination');
  const start = params.get('start_date');
  const end = params.get('end_date');
  if (destination) destInput.value = destination.slice(0, 100);
  if (start && isValidDate(start)) startInput.value = start;
  if (end && isValidDate(end) && (!startInput.value || end >= startInput.value)) endInput.value = end;
  updateDayCount();
  nameInput.focus();
}

async function init() {
  const editId = params.get('tripId') || params.get('trip');
  if (editId) {
    $('form-title').textContent = 'Edit trip';
    $('breadcrumb-current').textContent = 'Edit trip';
    document.title = 'Edit trip · Orbit';
    showAlert('Editing a trip is not available yet.');
    setBusy(true, 'Save changes');
    return;
  }

  prefillFromQuery();

  try {
    const res = await api('/auth/me');
    if (!res) return; // api.js is redirecting to login
    me = res.user;
    $('me-initials').textContent = initials(me.name);
    $('me-name').textContent = `${me.name.trim().split(/\s+/)[0]} (you)`;
  } catch (err) {
    showAlert(err.message || 'Could not load your account. Please refresh the page.');
  }
}

init();