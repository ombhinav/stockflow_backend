const { Pool } = require('pg');
require('dotenv').config();

// Validate DATABASE_URL format
const validateDatabaseUrl = (url) => {
  if (!url) return null;
  
  // Basic validation - must start with postgresql://
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    console.warn('⚠️ DATABASE_URL format may be invalid. Using individual DB credentials if available.');
    return null;
  }
  return url;
};

// Support both DATABASE_URL and individual credentials
const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }  // Always use SSL for external databases like Render
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'stockflow_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: process.env.DB_SSL === 'true' 
        ? { rejectUnauthorized: false } 
        : false
    };

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err.message);
  // Don't exit immediately - log and allow graceful degradation
  if (process.env.NODE_ENV === 'production') {
    process.exit(-1);
  }
});

// Test connection (non-blocking)
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.warn('⚠️ Database connection test failed:', err.message);
    console.warn('⚠️ Some features may not work until database is available');
  } else {
    console.log('✅ Database connection test successful:', res.rows[0].now);
  }
});

module.exports = pool;