// server/middleware/requireAuth.js  (You Jun)
// Protects an API route. The browser sends:  Authorization: Bearer <token>
// Sets req.user = { id, email } when the token is good, otherwise answers 401.
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { serverError } = require('../utils/errors');

module.exports = async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET_KEY, {
      algorithms: [process.env.JWT_ALGORITHM || 'HS256'],
    });
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

// Logout and password reset bump token_version, so older tokens stop working (LOG-11).
// Returns a 503 error with a generic message if the database is unavailable,
// preventing database details from being exposed to users (REG-13).
  let user;
  try {
    user = await User.findById(payload.id);
  } catch (err) {
    return serverError(res, err);
  }
  if (!user || user.token_version !== payload.tv) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  req.user = { id: user.id, email: user.email };
  next();
};
