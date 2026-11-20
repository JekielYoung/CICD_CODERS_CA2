const express = require('express');
require('dotenv').config();

const path = require('path');
const multer = require('multer');

const pool = require('./db');
const { serverError } = require('./utils/errors');

const app = express();

if (!process.env.JWT_SECRET_KEY) {
  console.warn('JWT_SECRET_KEY is not set. Copy .env.example to .env first.');
}

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve uploaded documents
app.use(
  '/uploads/documents',
  express.static(path.join(__dirname, 'uploads', 'documents'))
);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes: uncomment each line as its file is added
app.use('/api/auth', require('./routes/authRoutes.js'));
app.use('/api/trips', require('./routes/tripsRoutes'));
// app.use('/api/activities', require('./routes/activities.routes'));
app.use('/api/document', require('./routes/documentRoutes.js'));

app.use('/api', require('./routes/packingRoutes.js'));  

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {

  // Oversized or malformed request bodies are the client's fault: 400, not 500 (REG-09)
  if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid or oversized request.'
    });
  }

  // Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File exceeds the 10 MB limit.'
      });
    }

    return res.status(400).json({
      success: false,
      message: 'File upload failed.'
    });
  }

  // Unsupported file type
  if (err.message === 'Unsupported file type') {
    return res.status(400).json({
      success: false,
      message: 'Unsupported file type. Upload PDF or supported images.'
    });
  }

  console.error(err);

  res.status(err.status || 500).json({
    error: err.message || 'Server error'
  });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Orbit running at http://localhost:${port}`));
}

module.exports = app;