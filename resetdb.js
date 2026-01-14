require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL is missing in .env file.');
  process.exit(1);
}

const resetDatabase = async () => {
  // FIXED: Added SSL configuration here
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false // Required for most cloud databases (Render, Neon, etc.)
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database (SSL)...');

    // 1. DROP EXISTING TABLES
    console.log('🗑️  Dropping existing tables...');
    const dropQuery = `
      DROP TABLE IF EXISTS 
        alert_history, 
        alert_stocks, 
        sent_news, 
        corporate_events, 
        news_feed, 
        users 
      CASCADE;
    `;
    await client.query(dropQuery);
    console.log('✅ All tables dropped.');

    // 2. READ SCHEMA FILE
    const schemaPath = path.join(__dirname, '/src/models/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // 3. EXECUTE SCHEMA
    console.log('🏗️  Re-creating tables from schema.sql...');
    await client.query(schemaSql);
    console.log('✨ Database successfully reset!');

  } catch (err) {
    console.error('❌ Error resetting database:', err);
  } finally {
    await client.end();
    console.log('🔌 Disconnected.');
    process.exit(0);
  }
};

resetDatabase();