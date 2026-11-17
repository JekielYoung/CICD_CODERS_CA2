// server/controllers/authController.js  (You Jun)
// Register, login, logout, current user, forgot password and reset password.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('../models/userModel');
const PasswordReset = require('../models/passwordResetModel');
const mailer = require('../services/mailer');
const { LIMITS, normalizeEmail, isValidEmail, checkName, checkPassword } = require('../utils/validators');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
const RESET_TOKEN_MINUTES = 60;

// A real bcrypt hash of a random string. Login compares against it when the email
// is unknown, so "no such user" takes as long as "wrong password".
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(8).toString('hex'), BCRYPT_ROUNDS);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function signToken(user, keepLoggedIn) {
  return jwt.sign(
    { id: user.id, email: user.email, tv: user.token_version },
    process.env.JWT_SECRET_KEY,
    {
      algorithm: process.env.JWT_ALGORITHM || 'HS256',
      expiresIn: keepLoggedIn ? '7d' : process.env.JWT_EXPIRES_IN || '60m',
    }
  );
}

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email });

function badRequest(res, error, field) {
  return res.status(400).json({ error, field });
}

// Database down or unreachable -> 503, anything else unexpected -> 500.
// The message never includes database details.
function serverError(res, err) {
  console.error(err);
  const down =
    err && (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' ||
            /^(08|57P0)/.test(err.code || '') || /connection|timeout/i.test(err.message || ''));
  return res
    .status(down ? 503 : 500)
    .json({ error: down ? 'Service temporarily unavailable. Please try again.' : 'Something went wrong. Please try again.' });
}

// POST /api/auth/register   (REG-01 ... REG-13)
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    const nameError = checkName(name);
    if (nameError) return badRequest(res, nameError, 'name');

    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return badRequest(res, 'Email is required.', 'email');
    if (!isValidEmail(cleanEmail)) return badRequest(res, 'Enter a valid email address.', 'email');

    const passwordError = checkPassword(password);
    if (passwordError) return badRequest(res, passwordError, 'password');

    if (await User.findByEmail(cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists.', field: 'email' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let user;
    try {
      user = await User.create({ name: name.trim(), email: cleanEmail, passwordHash });
    } catch (err) {
      // Two people registering the same email at the same moment: the unique index wins
      if (err.code === '23505') {
        return res.status(409).json({ error: 'An account with this email already exists.', field: 'email' });
      }
      throw err;
    }

    return res.status(201).json({ token: signToken(user, false), user: publicUser(user) });
  } catch (err) {
    return serverError(res, err);
  }
};

// POST /api/auth/login   (LOG-01 ... LOG-07, LOG-12)
exports.login = async (req, res) => {
  try {
    const { email, password, keepLoggedIn } = req.body || {};

    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return badRequest(res, 'Email is required.', 'email');
    if (typeof password !== 'string' || password === '') return badRequest(res, 'Password is required.', 'password');
    // Anything this long cannot be a real password or email; skip the work
    if (cleanEmail.length > LIMITS.emailMax || password.length > 1000) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const user = await User.findByEmail(cleanEmail);
    const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    // Same answer for "no such email" and "wrong password"
    if (!user || !passwordOk) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    return res.json({ token: signToken(user, keepLoggedIn === true), user: publicUser(user) });
  } catch (err) {
    return serverError(res, err);
  }
};

// POST /api/auth/logout   (needs a valid token)   (LOG-11)
exports.logout = async (req, res) => {
  try {
    await User.bumpTokenVersion(req.user.id);
    return res.json({ message: 'Logged out.' });
  } catch (err) {
    return serverError(res, err);
  }
};

// GET /api/auth/me   (needs a valid token)
exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    return res.json({ user: publicUser(user) });
  } catch (err) {
    return serverError(res, err);
  }
};

// POST /api/auth/forgot-password   (FP-01, FP-02, FP-10, FP-11)
exports.forgotPassword = async (req, res) => {
  const generic = { message: 'If that email is registered, a reset link is on its way.' };
  try {
    const cleanEmail = normalizeEmail((req.body || {}).email);
    if (!isValidEmail(cleanEmail)) return badRequest(res, 'Enter a valid email address.', 'email');

    const user = await User.findByEmail(cleanEmail);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await PasswordReset.create({
        userId: user.id,
        tokenHash: sha256(token), // only the hash is stored
        expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000),
      });

      const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      const resetUrl = `${base}/reset-password.html?token=${token}`;
      try {
        await mailer.sendResetEmail(user.email, resetUrl);
      } catch (mailErr) {
        // Do not tell the browser: that would reveal the account exists
        console.error('Could not send reset email:', mailErr.message);
      }
    }

    return res.json(generic); // same reply whether or not the account exists
  } catch (err) {
    return serverError(res, err);
  }
};

// POST /api/auth/reset-password   (FP-03 ... FP-09, FP-12)
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body || {};

    const passwordError = checkPassword(password);
    if (passwordError) return badRequest(res, passwordError, 'password');

    const invalid = () =>
      res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });

    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return invalid();

    const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const done = await PasswordReset.consumeAndSetPassword(sha256(token), newHash);
    if (!done) return invalid();

    return res.json({ message: 'Password updated. You can now log in.' });
  } catch (err) {
    return serverError(res, err);
  }
};
