const express = require('express');
require('dotenv').config();

const path = require('path');

const pool = require('./db');
const tripRoutes = require('../trips.js');

const app = express();

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set. Copy .env.example to .env first.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api/trips", tripRoutes);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes: uncomment each line as its file is added
// app.use('/api/auth', require('./routes/auth.routes'));
// app.use('/api/trips', require('./routes/trips.routes'));
// app.use('/api/activities', require('./routes/activities.routes'));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Orbit running at http://localhost:${port}`));
}

module.exports = app;