require('dotenv').config();
const app = require('./src/app');
const pool = require('./src/config/database');
const fs = require('fs');
const path = require('path');
const { startMonitoring } = require('./src/services/monitoring.service');
const { syncCalendarEvents } = require('./src/services/calendar.service');
// 🟢 NEW IMPORT
const { syncIPOData } = require('./src/services/ipo.service'); 

const PORT = process.env.PORT || 5000;

const initializeDatabase = async () => {
  try {
    const schemaPath = path.join(__dirname, 'src', 'models', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
        console.error(`❌ Schema file not found at: ${schemaPath}`);
        return false;
    }
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✅ Database schema initialized');
    return true;
  } catch (error) {
    console.warn('⚠️ Database initialization warning:', error.message);
    return false;
  }
};

const startServer = async () => {
  try {
    const dbInitialized = await initializeDatabase();
    
    app.listen(PORT, async () => {
      console.log(`\n🚀 StockFlow Backend running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`📍 API Base URL: http://localhost:${PORT}/api`);
      
      if (dbInitialized) {
        console.log('✅ Database is connected and initialized');
        
        // Start Background Services
        startMonitoring(); 
        
        // 🟢 Run both Syncs in Parallel
        console.log('🔄 Starting Data Sync...');
        Promise.all([
            syncCalendarEvents(),
            syncIPOData() 
        ]).then(() => console.log('✨ All Data Syncs Completed'));
        
      } else {
        console.log('⚠️ Services skipped - database not available');
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();