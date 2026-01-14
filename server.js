require('dotenv').config();
const app = require('./src/app');
const pool = require('./src/config/database');
const fs = require('fs');
const path = require('path');
const { startMonitoring } = require('./src/services/monitoring.service');
const { syncCalendarEvents } = require('./src/services/calendar.service'); // <--- New Import

const PORT = process.env.PORT || 5000;

// 1. Define the missing function
// ... existing imports ...

const initializeDatabase = async () => {
  try {
    // FIX: Point to 'src/models/schema.sql' instead of root
    const schemaPath = path.join(__dirname, 'src', 'models', 'schema.sql');
    
    // Check if file exists before reading to avoid crashing
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

// ... rest of server.js ...

// 2. Start Server
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
        
        // Start Calendar Sync (Fetches NSE data)
        await syncCalendarEvents(); 
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