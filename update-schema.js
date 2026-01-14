require('dotenv').config();
const pool = require('./src/config/database');

async function updateSchema() {
  console.log("🔄 Updating Database Schema...");
  try {
    // 1. Create Calendar Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS corporate_events (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        company_name VARCHAR(255),
        event_date DATE NOT NULL,
        event_type VARCHAR(50),
        purpose TEXT,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, event_date, purpose)
      );
    `);
    console.log("✅ Created 'corporate_events' table.");

    // 2. Create Index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_corporate_events_date ON corporate_events(event_date);
    `);
    console.log("✅ Created index on event_date.");

    // 3. Add Columns to Users
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) DEFAULT 'starter',
      ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_payment_id VARCHAR(100);
    `);
    console.log("✅ Updated 'users' table columns.");

    console.log("🎉 Schema Update Complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to update schema:", error.message);
    process.exit(1);
  }
}

updateSchema();