// server/middleware/rateLimiters.js YouJun
// Blocks repeated attempts from one IP address (LOG-10, FP-10).
// Limits can be changed in .env: LOGIN_RATE_MAX, FORGOT_RATE_MAX.
const { rateLimit } = require('express-rate-limit');

const tooMany = (message) => (req, res) =>
  res.status(429).json({ error: message });

// 10 failed logins per 15 minutes. Successful logins are not counted.
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_MAX) || 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany('Too many login attempts. Please try again in a few minutes.'),
});

// 5 reset emails per hour
exports.forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.FORGOT_RATE_MAX) || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany('Too many reset requests. Please try again later.'),
});
