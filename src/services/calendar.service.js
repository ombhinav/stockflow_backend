const pool = require('../config/database');
const { fetchEventCalendar } = require('./nse.service');

const syncCalendarEvents = async () => {
  console.log('📅 Starting Calendar Sync (Source: NSE Event Calendar API)...');
  
  let totalCount = 0;

  try {
    // 1. Fetch from the specific NSE API
    const events = await fetchEventCalendar();

    if (events.length > 0) {
      for (const event of events) {
        // DATA MAPPING based on API response:
        // { "symbol": "ADOR", "company": "...", "date": "16-Jan-2026", "purpose": "...", "bm_desc": "..." }
        
        const symbol = event.symbol;
        const companyName = event.company; 
        const purpose = event.purpose;
        const description = event.bm_desc; // This contains the detailed agenda
        const dateStr = event.date;        // e.g. "16-Jan-2026"

        if (!dateStr || !symbol) continue;

        // Smart Tagging based on purpose
        let eventType = 'Board Meeting';
        const pLower = (purpose || '').toLowerCase();
        
        if (pLower.includes('result') || pLower.includes('financial')) {
          eventType = 'Result';
        } else if (pLower.includes('dividend') || pLower.includes('split') || pLower.includes('bonus')) {
          eventType = 'Corporate Action';
        } else if (pLower.includes('agm') || pLower.includes('egm')) {
          eventType = 'Meeting';
        }

        // Parse Date ("16-Jan-2026" works natively in JS Date constructor)
        const eventDate = new Date(dateStr);

        await insertEvent(symbol, companyName, eventDate, eventType, purpose, description);
        totalCount++;
      }
    } else {
      console.warn("⚠️ NSE returned 0 events.");
    }

  } catch (err) {
    console.error("❌ Calendar Sync Error:", err.message);
  }

  console.log(`✅ Sync Complete. Total Real Events in DB: ${totalCount}`);
};

async function insertEvent(symbol, companyName, dateObj, type, purpose, details) {
  try {
    if (isNaN(dateObj.getTime())) return;
    
    // Map bm_desc -> details column
    await pool.query(`
      INSERT INTO corporate_events (symbol, company_name, event_date, event_type, purpose, details)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (symbol, event_date, purpose) DO NOTHING
    `, [symbol, companyName, dateObj, type, purpose, details]);
  } catch (e) {
    // Ignore duplicates
  }
}

module.exports = { syncCalendarEvents };