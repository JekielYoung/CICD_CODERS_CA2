// server/routes/authRoutes.js  (You Jun)
const express = require('express');
const auth = require('../controllers/authController');
const requireAuth = require('../middleware/requireAuth');
const { loginLimiter, forgotLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/register', auth.register);
router.post('/login', loginLimiter, auth.login);
router.post('/logout', requireAuth, auth.logout);
router.get('/me', requireAuth, auth.me);
router.post('/forgot-password', forgotLimiter, auth.forgotPassword);
router.post('/reset-password', auth.resetPassword);

module.exports = router;
