const express = require('express');
require('dotenv').config();

const path = require('path');

const pool = require('./db');

const app = express();

if (!process.env.JWT_SECRET_KEY) {
  console.warn('JWT_SECRET_KEY is not set. Copy .env.example to .env first.');
}

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes: uncomment each line as its file is added
app.use('/api/auth', require('./routes/authRoutes.js'));
// app.use('/api/trips', require('./routes/trips.routes'));
// app.use('/api/activities', require('./routes/activities.routes'));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {

  // Oversized or malformed request bodies are the client's fault: 400, not 500 (REG-09)
  if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid or oversized request.' });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Orbit running at http://localhost:${port}`));
}

module.exports = app;