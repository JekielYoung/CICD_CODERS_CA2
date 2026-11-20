const { Pool } = require('pg');
require('dotenv').config();


const url = process.env.DATABASE_URL;
const useUrl = typeof url === 'string' && url !== '' && url !== 'undefined';

// One pool for the whole process. DATABASE_URL wins when set (CI and tests use it);
// otherwise the individual DB_* values are used.
const pool = useUrl
  ? new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'trip_planner',
      user: process.env.DB_USER || 'postgres',
      // pg requires password to be a string
      password: String(process.env.DB_PASSWORD ?? ''),
      connectionTimeoutMillis: 5000,
    });

// Without this, an idle-client error would crash the whole process
pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err.message);
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to PostgreSQL database:', err);
    return;
  }
  console.log('Connected to PostgreSQL database');
  release();
});

module.exports = pool;