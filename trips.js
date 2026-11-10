const express = require('express');
const router = express.Router();
const pool = require('./server/db');

// Mounted at /api/trips in server/app.js, so this is GET /api/trips/test-db
router.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');

    res.json({
      connected: true,
      databaseTime: result.rows[0].now
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      connected: false,
      message: 'Database connection failed',
      detail: error.message
    });
  }
});

// GET /api/trips  -> fetch sample data (trips + their owner)
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT t.trip_id, t.title, t.destination,
              t.start_date::text AS start_date, t.end_date::text AS end_date,
              t.is_public, u.name AS owner
         FROM trip t
         JOIN app_user u ON u.user_id = t.user_id
        ORDER BY t.start_date`
    );
    res.json({ count: result.rowCount, trips: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;