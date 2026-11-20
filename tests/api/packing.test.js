// tests/api/packing.test.js  (Packing list: PKG-01 .. PKG-20)
// Covers GET/POST /api/trips/:tripId/packing and PATCH/DELETE /api/packing/:itemId:
// validation, the owner/member permission rules, the 403-vs-404 split and the
// per-trip item cap.
//
// Runs against a real PostgreSQL database. TEST_DATABASE_URL must point at a
// separate test database; the suite refuses to run against anything whose name
// does not contain "test" (override with ALLOW_TEST_DB_ANY_NAME=1).

process.env.DOTENV_CONFIG_QUIET = 'true';
require('dotenv').config();

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'Set TEST_DATABASE_URL in .env (e.g. postgresql://postgres:postgres@localhost:5432/trip_planner_test)'
  );
}
// server/db.js reads DATABASE_URL first, so this is what points the app at the test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'test-only-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.LOGIN_RATE_MAX = '1000';
process.env.FORGOT_RATE_MAX = '1000';

const request = require('supertest');
const app = require('../../server/app');
const db = require('../../server/db');

const DOMAIN = '@orbit-test.example';
const PASSWORD = 'Passw0rdTest';
const MAX_ITEMS = 200;
const UNKNOWN_TRIP = '2147483647'; // largest PostgreSQL INT: a valid id that never exists

let counter = 0;
const newEmail = (label) => `${label}${Date.now()}${counter++}${DOMAIN}`;
const cleanup = () => db.query('DELETE FROM app_user WHERE email LIKE $1', [`%${DOMAIN}`]);

const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
const listUrl = (tripId) => `/api/trips/${tripId}/packing`;
const addItem = (tripId, user, body) => request(app).post(listUrl(tripId)).set(auth(user)).send(body);
const patchItem = (itemId, user, body) => request(app).patch(`/api/packing/${itemId}`).set(auth(user)).send(body);
const deleteItem = (itemId, user) => request(app).delete(`/api/packing/${itemId}`).set(auth(user));

async function makeUser(label) {
  const email = newEmail(label);
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: `Packing ${label}`, email, password: PASSWORD });
  expect(res.status).toBe(201);
  return { id: res.body.user.id, email, token: res.body.token };
}

// Trips are created with SQL because the trips API is not mounted yet (see server/app.js).
async function makeTrip(owner) {
  const { rows } = await db.query(
    `INSERT INTO trip (user_id, title, destination, start_date, end_date)
     VALUES ($1, 'Packing test trip', 'Kyoto', '2026-12-01', '2026-12-05')
     RETURNING trip_id`,
    [owner.id]
  );
  return rows[0].trip_id;
}

const addMember = (tripId, user) =>
  db.query(`INSERT INTO trip_member (trip_id, user_id, role) VALUES ($1, $2, 'Member')`, [tripId, user.id]);

let owner, member, outsider;

// A brand new trip for every test, so tests cannot leak state into each other.
async function freshTrip() {
  const tripId = await makeTrip(owner);
  await addMember(tripId, member);
  return tripId;
}

beforeAll(async () => {
  const { rows } = await db.query('SELECT current_database() AS name');
  const dbName = rows[0].name;
  if (!/test/i.test(dbName) && process.env.ALLOW_TEST_DB_ANY_NAME !== '1') {
    throw new Error(`Refusing to run against "${dbName}": point TEST_DATABASE_URL at a *_test database.`);
  }
  const column = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'packing_item' AND column_name = 'created_by'`
  );
  if (column.rows.length === 0) {
    throw new Error('packing_item.created_by is missing: run "npm run db:init:test" first.');
  }
  await cleanup();
  owner = await makeUser('owner');
  member = await makeUser('member');
  outsider = await makeUser('outsider');
});

afterAll(async () => {
  await cleanup();
  await db.end();
});

describe('POST /api/trips/:tripId/packing', () => {
  test('adds an item with a trimmed name and the default category', async () => {
    const tripId = await freshTrip();
    const res = await addItem(tripId, owner, { item_name: '  Passport  ' });
    expect(res.status).toBe(201);
    expect(res.body.item.item_name).toBe('Passport');
    expect(res.body.item.category).toBe('Others');
    expect(res.body.item.is_checked).toBe(false);
    expect(res.body.item.created_by).toBe(owner.id);
  });

  test('accepts every category in the enum', async () => {
    const tripId = await freshTrip();
    for (const category of ['Clothing', 'Electronics', 'Toiletries', 'Documents', 'Others']) {
      const res = await addItem(tripId, owner, { item_name: 'Thing', category });
      expect(res.status).toBe(201);
      expect(res.body.item.category).toBe(category);
    }
  });

  test('rejects invalid input with 400 and the offending field', async () => {
    const tripId = await freshTrip();
    const cases = [
      [{}, 'item_name'],
      [{ item_name: '   ' }, 'item_name'],
      [{ item_name: '\u200b\u200b' }, 'item_name'],
      [{ item_name: 'bad\u0000name' }, 'item_name'],
      [{ item_name: 'a'.repeat(256) }, 'item_name'],
      [{ item_name: null }, 'item_name'],
      [{ item_name: 42 }, 'item_name'],
      [{ item_name: 'Socks', category: 'Food' }, 'category'],
      [{ item_name: 'Socks', category: 'clothing' }, 'category'],
      [{ item_name: 'Socks', category: null }, 'category'],
    ];
    for (const [body, field] of cases) {
      const res = await addItem(tripId, owner, body);
      expect(res.status).toBe(400);
      expect(res.body.field).toBe(field);
    }
  });

  test('stores SQL-injection payloads as plain text', async () => {
    const tripId = await freshTrip();
    const evil = "Robert'); DROP TABLE packing_item;--";
    const res = await addItem(tripId, owner, { item_name: evil });
    expect(res.status).toBe(201);
    expect(res.body.item.item_name).toBe(evil);
  });

  test('answers 404 for a trip the user cannot access', async () => {
    const tripId = await freshTrip();
    expect((await addItem(tripId, outsider, { item_name: 'x' })).status).toBe(404);
  });

  test('rejects an invalid or unknown trip id', async () => {
    for (const bad of ['abc', '0', '-1', '1.5', '1e3', '99999999999']) {
      expect((await addItem(bad, owner, { item_name: 'x' })).status).toBe(400);
    }
    expect((await addItem(UNKNOWN_TRIP, owner, { item_name: 'x' })).status).toBe(404);
  });

  test('requires authentication', async () => {
    const tripId = await freshTrip();
    const res = await request(app).post(listUrl(tripId)).send({ item_name: 'x' });
    expect(res.status).toBe(401);
  });

  test('refuses more than 200 items in one trip', async () => {
    const tripId = await freshTrip();
    await db.query(
      `INSERT INTO packing_item (trip_id, item_name, created_by)
       SELECT $1, 'Bulk ' || g, $2 FROM generate_series(1, $3) AS g`,
      [tripId, owner.id, MAX_ITEMS]
    );
    expect((await addItem(tripId, owner, { item_name: 'One too many' })).status).toBe(400);
  });
});

describe('GET /api/trips/:tripId/packing', () => {
  test('returns the items with total and packed counts', async () => {
    const tripId = await freshTrip();
    const first = await addItem(tripId, owner, { item_name: 'Passport', category: 'Documents' });
    await addItem(tripId, member, { item_name: 'Sunscreen', category: 'Toiletries' });
    await addItem(tripId, owner, { item_name: 'Charger', category: 'Electronics' });
    await patchItem(first.body.item.item_id, member, { is_checked: true });

    const res = await request(app).get(listUrl(tripId)).set(auth(member));
    expect(res.status).toBe(200);
    expect(res.body.trip_id).toBe(tripId);
    expect(res.body.total).toBe(3);
    expect(res.body.packed).toBe(1);
    expect(res.body.items).toHaveLength(3);
    const names = res.body.items.map((i) => i.item_name);
    expect(names).toContain('Passport');
    expect(names).toContain('Sunscreen');
  });

  test('includes created_by on every item', async () => {
    const tripId = await freshTrip();
    await addItem(tripId, member, { item_name: 'Hat' });
    const res = await request(app).get(listUrl(tripId)).set(auth(owner));
    expect(res.body.items[0].created_by).toBe(member.id);
  });

  test('hides a trip the user cannot access', async () => {
    const tripId = await freshTrip();
    expect((await request(app).get(listUrl(tripId)).set(auth(outsider))).status).toBe(404);
    expect((await request(app).get(listUrl(tripId))).status).toBe(401);
  });

  test('rejects an invalid or unknown trip id', async () => {
    for (const bad of ['abc', '0', '-1', '1.5']) {
      expect((await request(app).get(listUrl(bad)).set(auth(owner))).status).toBe(400);
    }
    expect((await request(app).get(listUrl(UNKNOWN_TRIP)).set(auth(owner))).status).toBe(404);
  });
});

describe('PATCH /api/packing/:itemId', () => {
  test('lets the creator rename and recategorise an item', async () => {
    const tripId = await freshTrip();
    const created = await addItem(tripId, member, { item_name: 'Old', category: 'Others' });
    const res = await patchItem(created.body.item.item_id, member, { item_name: '  New  ', category: 'Documents' });
    expect(res.status).toBe(200);
    expect(res.body.item.item_name).toBe('New');
    expect(res.body.item.category).toBe('Documents');
  });

  test('lets the trip owner edit an item someone else added', async () => {
    const tripId = await freshTrip();
    const created = await addItem(tripId, member, { item_name: 'Hat' });
    const res = await patchItem(created.body.item.item_id, owner, { item_name: 'Sun hat' });
    expect(res.status).toBe(200);
    expect(res.body.item.item_name).toBe('Sun hat');
  });

  test('blocks a member from renaming or recategorising someone elses item', async () => {
    const tripId = await freshTrip();
    const created = await addItem(tripId, owner, { item_name: 'Passport' });
    const id = created.body.item.item_id;
    expect((await patchItem(id, member, { item_name: 'Hacked' })).status).toBe(403);
    expect((await patchItem(id, member, { category: 'Documents' })).status).toBe(403);
    const after = await request(app).get(listUrl(tripId)).set(auth(owner));
    expect(after.body.items.find((i) => i.item_id === id).item_name).toBe('Passport');
  });

  test('lets any trip member tick an item off', async () => {
    const tripId = await freshTrip();
    const created = await addItem(tripId, owner, { item_name: 'Passport' });
    const id = created.body.item.item_id;
    expect((await patchItem(id, member, { is_checked: true })).body.item.is_checked).toBe(true);
    expect((await patchItem(id, member, { is_checked: false })).body.item.is_checked).toBe(false);
  });

  test('rejects an empty or invalid body with 400', async () => {
    const tripId = await freshTrip();
    const id = (await addItem(tripId, owner, { item_name: 'Passport' })).body.item.item_id;
    for (const body of [{}, { item_name: '   ' }, { item_name: null }, { category: 'Food' }, { is_checked: 'true' }, { is_checked: 1 }]) {
      expect((await patchItem(id, owner, body)).status).toBe(400);
    }
  });

  test('answers 404 for an unknown item or a trip the user cannot see', async () => {
    expect((await patchItem('99999999', owner, { is_checked: true })).status).toBe(404);

    const privateTrip = await makeTrip(outsider);
    const hidden = (await addItem(privateTrip, outsider, { item_name: 'Private' })).body.item.item_id;
    expect((await patchItem(hidden, owner, { is_checked: true })).status).toBe(404);
  });
});

describe('DELETE /api/packing/:itemId', () => {
  test('lets a member delete their own item', async () => {
    const tripId = await freshTrip();
    const id = (await addItem(tripId, member, { item_name: 'Hat' })).body.item.item_id;
    const res = await deleteItem(id, member);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect((await deleteItem(id, member)).status).toBe(404);
  });

  test('lets the trip owner delete any item', async () => {
    const tripId = await freshTrip();
    const id = (await addItem(tripId, member, { item_name: 'Hat' })).body.item.item_id;
    expect((await deleteItem(id, owner)).status).toBe(200);
  });

  test('blocks a member from deleting someone elses item', async () => {
    const tripId = await freshTrip();
    const id = (await addItem(tripId, owner, { item_name: 'Passport' })).body.item.item_id;
    expect((await deleteItem(id, member)).status).toBe(403);
    const res = await request(app).get(listUrl(tripId)).set(auth(owner));
    expect(res.body.items.map((i) => i.item_id)).toContain(id);
  });

  test('hides items on trips the user cannot access', async () => {
    const tripId = await freshTrip();
    const id = (await addItem(tripId, owner, { item_name: 'Passport' })).body.item.item_id;
    expect((await deleteItem(id, outsider)).status).toBe(404);
    expect((await request(app).delete(`/api/packing/${id}`)).status).toBe(401);
  });

  test('keeps items whose author was deleted, with no author', async () => {
    const tripId = await freshTrip();
    const temp = await makeUser('temp');
    await addMember(tripId, temp);
    const id = (await addItem(tripId, temp, { item_name: 'Orphan' })).body.item.item_id;

    await db.query('DELETE FROM app_user WHERE user_id = $1', [temp.id]);
    const res = await request(app).get(listUrl(tripId)).set(auth(owner));
    expect(res.body.items.find((i) => i.item_id === id).created_by).toBe(null);
    expect((await deleteItem(id, owner)).status).toBe(200);
  });
});