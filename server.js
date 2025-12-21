require('dotenv').config();
const app = require('./src/app');
const pool = require('./src/config/database');
const { startMonitoring } = require('./src/services/monitoring.service');

const PORT = process.env.PORT || 5000;

// Initialize database schema
const initializeDatabase = async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, 'src', 'models', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schema);
    console.log('✅ Database schema initialized');
    return true;
  } catch (error) {
    console.warn('⚠️ Database initialization warning:', error.message);
    console.warn('⚠️ Database may not be available. Some features will not work until DB is connected.');
    return false;
  }
};

// Start server
const startServer = async () => {
  try {
    const dbInitialized = await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 StockFlow Backend running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`📍 API Base URL: http://localhost:${PORT}/api`);
      
      if (dbInitialized) {
        console.log('✅ Database is connected and initialized');
        // Start news monitoring service only if DB is ready
        startMonitoring();
      } else {
        console.log('⚠️ Monitoring service skipped - database not available');
        console.log('⚠️ Please configure DATABASE_URL or local DB credentials to enable monitoring');
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();