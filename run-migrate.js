require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/database');

const runMigration = async () => {
  try {
    const migPath = path.join(__dirname, 'src', 'models', 'migrate_telegram.sql');
    if (!fs.existsSync(migPath)) {
      console.error(`Migration file not found: ${migPath}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(migPath, 'utf8');
    console.log('🔄 Running migration: migrate_telegram.sql');

    // Execute migration SQL
    await pool.query(sql);

    console.log('✅ Migration applied successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
};

runMigration();
