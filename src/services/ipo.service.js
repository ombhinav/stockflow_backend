const axios = require('axios');
const pool = require('../config/database');

// --- NSE SESSION STATE ---
let nseCookies = '';

// NSE requires browser-like headers
const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
  'Referer': 'https://www.nseindia.com/'
};

// 1. Helper: Get Valid Cookies (Session)
const refreshNseSession = async () => {
  try {
    console.log('🔄 Refreshing NSE Session Cookies...');
    const response = await axios.get('https://www.nseindia.com', {
      headers: BASE_HEADERS
    });
    
    // Extract cookies from header
    const cookies = response.headers['set-cookie'];
    if (cookies) {
      nseCookies = cookies.map(c => c.split(';')[0]).join('; ');
      console.log('✅ New NSE Session Established');
    }
  } catch (err) {
    console.error('❌ Failed to refresh NSE session:', err.message);
  }
};

// 2. Helper: Fetch with Auto-Retry
const fetchNseData = async (url) => {
  // If no cookies, get them first
  if (!nseCookies) await refreshNseSession();

  try {
    const response = await axios.get(url, {
      headers: { ...BASE_HEADERS, 'Cookie': nseCookies }
    });
    return response.data;
  } catch (err) {
    // If 401/403 (Session Expired), retry ONCE
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      console.warn('⚠️ NSE Session Expired. Retrying...');
      await refreshNseSession();
      
      // Retry request with new cookies
      const retryResponse = await axios.get(url, {
        headers: { ...BASE_HEADERS, 'Cookie': nseCookies }
      });
      return retryResponse.data;
    }
    throw err; // Re-throw other errors
  }
};

// 3. Helper to Insert Data into DB
const insertIPO = async (data, category) => {
  const query = `
    INSERT INTO ipo_events 
    (symbol, company_name, series, open_date, close_date, price_band, subscription_ratio, category, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (symbol, category) DO UPDATE SET
    subscription_ratio = EXCLUDED.subscription_ratio,
    status = EXCLUDED.status,
    price_band = EXCLUDED.price_band;
  `;

  // Normalize Data Keys
  const symbol = data.symbol;
  const name = data.companyName || data.company;
  const series = data.securityType || data.series || 'EQ';
  const start = data.ipoStartDate || data.issueStartDate || '-';
  const end = data.ipoEndDate || data.issueEndDate || '-';
  const price = data.priceRange || data.issuePrice || '-';
  const sub = data.noOfTime || null;
  const status = data.status || (category === 'past' ? 'Closed' : 'Active');

  try {
    if (symbol) {
      await pool.query(query, [symbol, name, series, start, end, price, sub, category, status]);
    }
  } catch (err) {
    console.error(`⚠️ Failed to insert IPO ${symbol}:`, err.message);
  }
};

// 4. Main Sync Function
const syncIPOData = async () => {
  console.log('🚀 Starting IPO Background Sync...');
  
  const categories = [
    { type: 'current', url: 'https://www.nseindia.com/api/ipo-current-issue' },
    { type: 'upcoming', url: 'https://www.nseindia.com/api/all-upcoming-issues?category=ipo' },
    { type: 'past', url: 'https://www.nseindia.com/api/public-past-issues' }
  ];

  for (const cat of categories) {
    try {
      // Use our smart fetcher instead of plain axios
      const data = await fetchNseData(cat.url);
      const items = Array.isArray(data) ? data : [];
      
      console.log(`📥 Fetching ${cat.type.toUpperCase()}: Found ${items.length} records.`);
      
      for (const item of items) {
        await insertIPO(item, cat.type);
      }
    } catch (err) {
      console.error(`❌ Error syncing ${cat.type} IPOs:`, err.message);
    }
  }
  console.log('✅ IPO Sync Complete.');
};

// 5. Fetch from DB with INTELLIGENT SORTING (Updated)
const getIPOsFromDB = async (category) => {
  try {
    const result = await pool.query('SELECT * FROM ipo_events WHERE category = $1', [category]);
    
    // Sort logic in JavaScript to handle string dates ("14-Jan-2026")
    const sortedRows = result.rows.sort((a, b) => {
      // Pick a date field to sort by (Open date is usually most reliable for sorting)
      const dateA = new Date(a.open_date);
      const dateB = new Date(b.open_date);
      
      if (category === 'past') {
        // PAST: Newest first (Descending) -> 2026 before 2012
        return dateB - dateA;
      } else {
        // UPCOMING / CURRENT: Soonest first (Ascending) -> Jan 13 before Jan 19
        return dateA - dateB;
      }
    });

    return sortedRows;
  } catch (err) {
    console.error("Database Error:", err);
    return [];
  }
};

module.exports = { syncIPOData, getIPOsFromDB };