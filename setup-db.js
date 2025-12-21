require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/database');

const setupDatabase = async () => {
  try {
    console.log('🔄 Setting up database...');
    
    const schemaPath = path.join(__dirname, 'src', 'models', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schema);
    
    console.log('✅ Database setup complete!');
    console.log('📊 Tables created:');
    console.log('   - users');
    console.log('   - alert_stocks');
    console.log('   - alert_history');
    console.log('   - sent_news');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
};

setupDatabase();