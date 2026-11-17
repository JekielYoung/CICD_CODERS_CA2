// tests/api/auth.test.js  YouJun
// Covers the Backend QA checklist: REG-01..13, LOG-01..12, FP-01..12.
//
// These tests use a real PostgreSQL database. Set TEST_DATABASE_URL in .env to point
// at a separate test database (recommended). If it is not set, DATABASE_URL is used.
// Only rows whose email ends in @orbit-test.example are ever created or deleted.

process.env.DOTENV_CONFIG_QUIET = 'true'; // hide dotenv's startup message
require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
process.env.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'test-only-secret';
process.env.JWT_EXPIRES_IN = '60m';
process.env.BCRYPT_ROUNDS = '4'; // fast hashing in tests
// The main app gets very high limits so ordinary tests are never blocked.
// LOG-10 and FP-10 load their own copy of the app with small limits.
process.env.LOGIN_RATE_MAX = '1000';
process.env.FORGOT_RATE_MAX = '1000';

const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../../server/app');
const db = require('../../server/db');
const mailer = require('../../server/services/mailer');

const DOMAIN = '@orbit-test.example';
let counter = 0;
const newEmail = (label = 'user') => `${label}${Date.now()}${counter++}${DOMAIN}`;
const PASSWORD = 'Passw0rdTest';

const cleanup = () => db.query('DELETE FROM app_user WHERE email LIKE $1', [`%${DOMAIN}`]);
const countUsers = async (email) =>
  Number((await db.query('SELECT COUNT(*) FROM app_user WHERE LOWER(email) = LOWER($1)', [email])).rows[0].count);
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

const register = (body) => request(app).post('/api/auth/register').send(body);
const login = (body) => request(app).post('/api/auth/login').send(body);

// Makes a user and returns { email, password, token }
async function makeUser(label) {
  const email = newEmail(label);
  const res = await register({ name: 'Test User', email, password: PASSWORD });
  expect(res.status).toBe(201);
  return { email, password: PASSWORD, token: res.body.token };
}

// Asks for a reset and returns the token that would have been emailed
async function requestResetToken(email) {
  const spy = jest.spyOn(mailer, 'sendResetEmail').mockResolvedValue();
  const res = await request(app).post('/api/auth/forgot-password').send({ email });
  expect(res.status).toBe(200);
  const url = spy.mock.calls[spy.mock.calls.length - 1][1];
  spy.mockRestore();
  return new URL(url).searchParams.get('token');
}

// Loads a second copy of the app with its own rate-limit counters
function freshApp(env) {
  let fresh;
  jest.isolateModules(() => {
    Object.assign(process.env, env);
    fresh = { app: require('../../server/app'), db: require('../../server/db') };
  });
  Object.keys(env).forEach((key) => delete process.env[key]);
  return fresh;
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await db.end();
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------- 1A Registration
describe('1A. Registration', () => {
  test('REG-01 valid name, email and password -> 201, user saved', async () => {
    const email = newEmail('reg01');
    const res = await register({ name: 'John Doe', email, password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'John Doe', email });
    expect(typeof res.body.token).toBe('string');
    expect(await countUsers(email)).toBe(1);
  });

  test('REG-02 existing email -> 409, no duplicate', async () => {
    const { email } = await makeUser('reg02');
    const res = await register({ name: 'Other', email, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(await countUsers(email)).toBe(1);
  });

  test('REG-03 different capitalisation -> 409, case-insensitive uniqueness', async () => {
    const { email } = await makeUser('reg03');
    const res = await register({ name: 'Other', email: email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(409);
    expect(await countUsers(email)).toBe(1);
  });

  test('REG-04 without name -> 400', async () => {
    const email = newEmail('reg04');
    expect((await register({ email, password: PASSWORD })).status).toBe(400);
    expect((await register({ name: '   ', email, password: PASSWORD })).status).toBe(400);
    expect(await countUsers(email)).toBe(0);
  });

  test('REG-05 without email -> 400', async () => {
    expect((await register({ name: 'A', password: PASSWORD })).status).toBe(400);
    expect((await register({ name: 'A', email: '', password: PASSWORD })).status).toBe(400);
  });

  test('REG-06 without password -> 400', async () => {
    const email = newEmail('reg06');
    expect((await register({ name: 'A', email })).status).toBe(400);
    expect(await countUsers(email)).toBe(0);
  });

  test('REG-07 invalid email format -> 400', async () => {
    for (const email of ['not-an-email', 'a@b', '@orbit-test.example', 'two words@orbit-test.example']) {
      const res = await register({ name: 'A', email, password: PASSWORD });
      expect(res.status).toBe(400);
    }
  });

  test('REG-08 password below minimum length (or without a number) -> 400', async () => {
    const email = newEmail('reg08');
    expect((await register({ name: 'A', email, password: 'abc12' })).status).toBe(400);
    expect((await register({ name: 'A', email, password: 'abcdefghij' })).status).toBe(400);
    expect(await countUsers(email)).toBe(0);
  });

  test('REG-09 oversized input fields -> 400', async () => {
    const email = newEmail('reg09');
    expect((await register({ name: 'a'.repeat(101), email, password: PASSWORD })).status).toBe(400);
    expect((await register({ name: 'A', email: 'a'.repeat(250) + DOMAIN, password: PASSWORD })).status).toBe(400);
    expect((await register({ name: 'A', email, password: 'a1'.repeat(60) })).status).toBe(400);
    // a whole request body that is far too big
    expect((await register({ name: 'a'.repeat(50000), email, password: PASSWORD })).status).toBe(400);
    expect(await countUsers(email)).toBe(0);
  });

  test('REG-10 stored password is a secure hash, never plaintext', async () => {
    const { email, password } = await makeUser('reg10');
    const { rows } = await db.query('SELECT password_hash FROM app_user WHERE email = $1', [email]);
    expect(rows[0].password_hash).not.toBe(password);
    expect(rows[0].password_hash).not.toContain(password);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/); // bcrypt format
  });

  test('REG-11 SQL injection input is handled as data', async () => {
    const evilName = "Robert'); DROP TABLE app_user;--";
    const email = newEmail('reg11');
    const res = await register({ name: evilName, email, password: PASSWORD });
    expect(res.status).toBe(201);

    // table still exists and the name was saved as plain text
    const { rows } = await db.query('SELECT name FROM app_user WHERE email = $1', [email]);
    expect(rows[0].name).toBe(evilName);

    // injection through the email field is rejected as an invalid email
    const res2 = await register({ name: 'A', email: "x' OR '1'='1", password: PASSWORD });
    expect(res2.status).toBe(400);
  });

  test('REG-12 spaces around email -> normalised consistently', async () => {
    const clean = newEmail('reg12');
    const res = await register({ name: 'A', email: `   ${clean.toUpperCase()}  `, password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(clean);
    const { rows } = await db.query('SELECT email FROM app_user WHERE LOWER(email) = $1', [clean]);
    expect(rows[0].email).toBe(clean);
    expect((await login({ email: clean, password: PASSWORD })).status).toBe(200);
  });

  test('REG-13 database unavailable -> controlled 5xx, no partial account', async () => {
    const email = newEmail('reg13');
    jest
      .spyOn(db, 'query')
      .mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }));
    const res = await register({ name: 'A', email, password: PASSWORD });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.status).toBeLessThan(600);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/); // no internals leaked

    jest.restoreAllMocks();
    expect(await countUsers(email)).toBe(0);
  });
});

// ---------------------------------------------------------------- 1B Login
describe('1B. Login', () => {
  let user;
  beforeAll(async () => {
    user = await makeUser('login');
  });

  test('LOG-01 valid credentials -> 200, authenticated', async () => {
    const res = await login({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(user.email);
  });

  test('LOG-02 wrong password -> 401', async () => {
    expect((await login({ email: user.email, password: 'WrongPass123' })).status).toBe(401);
  });

  test('LOG-03 unregistered email -> 401 (same message as wrong password)', async () => {
    const wrongPw = await login({ email: user.email, password: 'WrongPass123' });
    const noUser = await login({ email: newEmail('ghost'), password: PASSWORD });
    expect(noUser.status).toBe(401);
    expect(noUser.body.error).toBe(wrongPw.body.error);
  });

  test('LOG-04 empty email -> 400', async () => {
    expect((await login({ email: '', password: PASSWORD })).status).toBe(400);
    expect((await login({ password: PASSWORD })).status).toBe(400);
  });

  test('LOG-05 empty password -> 400', async () => {
    expect((await login({ email: user.email, password: '' })).status).toBe(400);
    expect((await login({ email: user.email })).status).toBe(400);
  });

  test('LOG-06 email in different capitalisation -> login succeeds', async () => {
    const res = await login({ email: user.email.toUpperCase(), password: user.password });
    expect(res.status).toBe(200);
  });

  test('LOG-07 SQL injection payload -> denied, no SQL executed', async () => {
    expect((await login({ email: "' OR 1=1 --", password: PASSWORD })).status).toBe(401);
    expect((await login({ email: user.email, password: "' OR '1'='1" })).status).toBe(401);
    expect((await login({ email: `${user.email}' --`, password: PASSWORD })).status).toBe(401);
  });

  test('LOG-08 protected API without authentication -> 401', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
  });

  test('LOG-09 invalid or expired token -> 401', async () => {
    const get = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect((await get('garbage')).status).toBe(401);

    const payload = { id: 1, email: user.email, tv: 0 };
    const expired = jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn: -10 });
    expect((await get(expired)).status).toBe(401);

    const wrongSecret = jwt.sign(payload, 'some-other-secret');
    expect((await get(wrongSecret)).status).toBe(401);

    const noneAlg = jwt.sign(payload, '', { algorithm: 'none' });
    expect((await get(noneAlg)).status).toBe(401);
  });

  test('LOG-10 repeated invalid login attempts -> rate limited', async () => {
    const fresh = freshApp({ LOGIN_RATE_MAX: '3' });
    const attempt = () =>
      request(fresh.app).post('/api/auth/login').send({ email: user.email, password: 'WrongPass123' });
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
    await fresh.db.end();
  });

  test('LOG-11 logout then reuse of the old token -> denied', async () => {
    const { token } = (await login({ email: user.email, password: user.password })).body;
    const auth = { Authorization: `Bearer ${token}` };

    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set(auth)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(401);

    // logging in again still works
    expect((await login({ email: user.email, password: user.password })).status).toBe(200);
  });

  test('LOG-12 login response has no password hash or sensitive fields', async () => {
    const res = await login({ email: user.email, password: user.password });
    expect(Object.keys(res.body).sort()).toEqual(['token', 'user']);
    expect(Object.keys(res.body.user).sort()).toEqual(['email', 'id', 'name']);
    expect(JSON.stringify(res.body.user)).not.toMatch(/password|hash|token_version|\$2[aby]\$/i);
  });
});

// ---------------------------------------------------------------- 1C Forgot password
describe('1C. Forgot password', () => {
  test('FP-01 reset for registered email -> reset email issued', async () => {
    const { email } = await makeUser('fp01');
    const spy = jest.spyOn(mailer, 'sendResetEmail').mockResolvedValue();
    const res = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(email);
    expect(spy.mock.calls[0][1]).toMatch(/reset-password\.html\?token=[0-9a-f]{64}$/);

    const { rows } = await db.query(
      `SELECT pr.expires_at FROM password_reset pr JOIN app_user u ON u.user_id = pr.user_id WHERE u.email = $1`,
      [email]
    );
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  test('FP-02 reset for unregistered email -> generic response, no account disclosure', async () => {
    const { email } = await makeUser('fp02');
    const spy = jest.spyOn(mailer, 'sendResetEmail').mockResolvedValue();

    const real = await request(app).post('/api/auth/forgot-password').send({ email });
    const ghost = await request(app).post('/api/auth/forgot-password').send({ email: newEmail('ghost') });

    expect(ghost.status).toBe(real.status);
    expect(ghost.body).toEqual(real.body);
    expect(spy).toHaveBeenCalledTimes(1); // only the real account got an email
  });

  test('FP-03 valid token and new password -> password hash updated (FP-08, FP-09 too)', async () => {
    const { email, password, token: oldSessionToken } = await makeUser('fp03');
    const resetToken = await requestResetToken(email);
    const before = (await db.query('SELECT password_hash FROM app_user WHERE email = $1', [email])).rows[0];

    const res = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'NewPassw0rd9' });
    expect(res.status).toBe(200);

    const after = (await db.query('SELECT password_hash FROM app_user WHERE email = $1', [email])).rows[0];
    expect(after.password_hash).not.toBe(before.password_hash);

    // FP-08 old password denied, FP-09 new password works
    expect((await login({ email, password })).status).toBe(401);
    expect((await login({ email, password: 'NewPassw0rd9' })).status).toBe(200);

    // sessions from before the reset are signed out
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldSessionToken}`);
    expect(me.status).toBe(401);
  });

  test('FP-04 expired reset token -> rejected, password unchanged', async () => {
    const { email, password } = await makeUser('fp04');
    const resetToken = await requestResetToken(email);
    await db.query('UPDATE password_reset SET expires_at = now() - interval \'1 minute\' WHERE token_hash = $1', [sha256(resetToken)]);

    const res = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'NewPassw0rd9' });
    expect(res.status).toBe(400);
    expect((await login({ email, password })).status).toBe(200);
  });

  test('FP-05 invalid token -> rejected', async () => {
    for (const token of [crypto.randomBytes(32).toString('hex'), 'garbage', '0'.repeat(64), "' OR 1=1 --"]) {
      const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'NewPassw0rd9' });
      expect(res.status).toBe(400);
    }
  });

  test('FP-06 reuse of a consumed reset token -> rejected', async () => {
    const { email } = await makeUser('fp06');
    const resetToken = await requestResetToken(email);
    const first = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'NewPassw0rd9' });
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'Another1Pass' });
    expect(second.status).toBe(400);
    expect((await login({ email, password: 'NewPassw0rd9' })).status).toBe(200); // still the first new password
  });

  test('FP-07 too-short new password -> 400, token still usable', async () => {
    const { email } = await makeUser('fp07');
    const resetToken = await requestResetToken(email);
    const short = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'abc1' });
    expect(short.status).toBe(400);
    const ok = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'LongEnough1' });
    expect(ok.status).toBe(200);
  });

  test('FP-08 / FP-09 old password denied, new password works (see FP-03)', async () => {
    const { email, password } = await makeUser('fp0809');
    const resetToken = await requestResetToken(email);
    await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'BrandNew123' });
    expect((await login({ email, password })).status).toBe(401);
    expect((await login({ email, password: 'BrandNew123' })).status).toBe(200);
  });

  test('FP-10 too many reset emails -> rate limited', async () => {
    const { email } = await makeUser('fp10');
    const fresh = freshApp({ FORGOT_RATE_MAX: '3' });
    const ask = () => request(fresh.app).post('/api/auth/forgot-password').send({ email });
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(429);
    await fresh.db.end();
  });

  test('FP-11 stored reset credentials are a token hash, not the raw token', async () => {
    const { email } = await makeUser('fp11');
    const resetToken = await requestResetToken(email);
    const { rows } = await db.query(
      `SELECT pr.* FROM password_reset pr JOIN app_user u ON u.user_id = pr.user_id WHERE u.email = $1`,
      [email]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(sha256(resetToken));
    expect(rows[0].token_hash).not.toBe(resetToken);
    expect(JSON.stringify(rows[0])).not.toContain(resetToken);
  });

  test('FP-12 incomplete or expired reset request -> no password modification', async () => {
    const { email, password } = await makeUser('fp12');
    const resetToken = await requestResetToken(email);
    const before = (await db.query('SELECT password_hash FROM app_user WHERE email = $1', [email])).rows[0];

    const missingToken = await request(app).post('/api/auth/reset-password').send({ password: 'NewPassw0rd9' });
    const missingPassword = await request(app).post('/api/auth/reset-password').send({ token: resetToken });
    const empty = await request(app).post('/api/auth/reset-password').send({});
    expect([missingToken.status, missingPassword.status, empty.status]).toEqual([400, 400, 400]);

    const after = (await db.query('SELECT password_hash FROM app_user WHERE email = $1', [email])).rows[0];
    expect(after.password_hash).toBe(before.password_hash);
    expect((await login({ email, password })).status).toBe(200);
  });
});
