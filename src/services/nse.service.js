const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { NSE_ANNOUNCEMENTS_URL } = require('../config/constants');
const { NseIndia } = require('stock-nse-india');

// Initialize NSE India client (Keep this for search/cache logic)
const nseIndia = new NseIndia();

// --- CACHE SETUP (Keep existing) ---
const CACHE_DIR = path.join(__dirname, '../../data');
const CACHE_FILE = path.join(CACHE_DIR, 'stocks-cache.json');
const CACHE_TIMESTAMP_FILE = path.join(CACHE_DIR, 'stocks-cache-timestamp.json');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

let allSymbolsCache = [];
let isCacheReady = false;
let companyNameCache = {};

const POPULAR_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFC', 'LT', 'HCLTECH', 'WIPRO', 'MARUTI', 'AXIS', 'ICICIBANK',
  'SBIN', 'HINDUSTAN', 'BAJAJFINSV', 'BAJAJ-AUTO', 'ITC', 'SUNPHARMA', 'ADANIPORTS', 'ASIANPAINT', 'TITAN', 'M&M'
];

// --- SESSION MANAGEMENT (CRITICAL FOR NEW API) ---
let nseCookies = '';
let cookieLastUpdated = 0;

const getNSEHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-event-calendar',
  'X-Requested-With': 'XMLHttpRequest'
});

// 1. Helper: Get Fresh Cookies
const refreshSession = async () => {
  try {
    const response = await axios.get('https://www.nseindia.com', {
      headers: { ...getNSEHeaders(), 'Referer': 'https://www.google.com/' }
    });
    const cookies = response.headers['set-cookie'];
    if (cookies) {
      nseCookies = cookies.map(c => c.split(';')[0]).join('; ');
      cookieLastUpdated = Date.now();
      console.log('✅ NSE Session Initialized (Cookies Acquired)');
    }
  } catch (error) {
    console.error('❌ Failed to refresh NSE session:', error.message);
  }
};

// 2. Helper: Fetch with Auto-Session
const fetchWithSession = async (url) => {
  // Refresh if no cookies or older than 5 minutes
  if (!nseCookies || (Date.now() - cookieLastUpdated) > 300000) {
    await refreshSession();
  }

  try {
    const response = await axios.get(url, {
      headers: { ...getNSEHeaders(), 'Cookie': nseCookies }
    });
    return response.data;
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.log('🔄 Session expired. Retrying...');
      await refreshSession(); 
      const retryResponse = await axios.get(url, {
        headers: { ...getNSEHeaders(), 'Cookie': nseCookies }
      });
      return retryResponse.data;
    }
    throw error;
  }
};

// ✅ TARGET ENDPOINT
const NSE_EVENT_CALENDAR_URL = 'https://www.nseindia.com/api/event-calendar?index=equities';

// --- EXPORTED FUNCTIONS ---

// 1. Fetch Event Calendar (The New Function)
const fetchEventCalendar = async () => {
  try {
    console.log('📅 Fetching NSE Event Calendar...');
    const data = await fetchWithSession(NSE_EVENT_CALENDAR_URL);
    
    // NSE usually returns an array directly, or inside a key
    const events = Array.isArray(data) ? data : (data.data || []);
    
    console.log(`✅ Fetched ${events.length} calendar events from NSE.`);
    return events;
  } catch (error) {
    console.error('❌ Failed to fetch event calendar:', error.message);
    return [];
  }
};

// 2. Fetch Latest News (Existing)
const fetchLatestNews = async () => {
  try {
    const response = await axios.get(NSE_ANNOUNCEMENTS_URL, { headers: getNSEHeaders(), timeout: 10000 });
    return response.data ? (Array.isArray(response.data) ? response.data : response.data.data || []) : [];
  } catch (error) { return []; }
};

// ... (Keep existing Cache Loading, Search, and IIFE logic below as is) ...
const loadPersistedCache = () => {
  try {
    if (fs.existsSync(CACHE_FILE)) return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) { }
  return [];
};

const savePersistedCache = (stocks) => {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(stocks, null, 2));
    fs.writeFileSync(CACHE_TIMESTAMP_FILE, JSON.stringify({ lastUpdated: new Date().toISOString() }));
  } catch (error) {}
};

const findNewSymbols = (oldStocks, newSymbols) => {
  const oldSymbolSet = new Set(oldStocks.map(s => s.symbol));
  return newSymbols.filter(s => !oldSymbolSet.has(s));
};

const getCompanyName = async (symbol) => {
  if (companyNameCache[symbol]) return companyNameCache[symbol];
  try {
    const quoteData = await nseIndia.getEquityDetails(symbol);
    if (quoteData && quoteData.info) {
      const name = quoteData.info.companyName || quoteData.info.companyShortName || symbol;
      companyNameCache[symbol] = name;
      return name;
    }
  } catch (e) {}
  companyNameCache[symbol] = symbol;
  return symbol;
};

// Initialization IIFE
(async () => {
  try {
    console.log('⏳ Starting NSE symbols cache initialization...');
    const persistedCache = loadPersistedCache();
    const currentSymbols = await nseIndia.getAllStockSymbols().catch(() => []);
    
    if (currentSymbols && currentSymbols.length > 0) {
      const newSymbols = findNewSymbols(persistedCache, currentSymbols);
      allSymbolsCache = [...persistedCache, ...newSymbols.map(s => ({ symbol: s, name: s }))];
      isCacheReady = true;
      console.log(`✅ Cache ready: ${allSymbolsCache.length} stocks`);
      if (newSymbols.length > 0) savePersistedCache(allSymbolsCache);
    } else {
      allSymbolsCache = persistedCache.length > 0 ? persistedCache : POPULAR_STOCKS.map(s => ({ symbol: s, name: s }));
      isCacheReady = true;
    }
  } catch (error) {
    allSymbolsCache = POPULAR_STOCKS.map(s => ({ symbol: s, name: s }));
    isCacheReady = true;
  }
})();

const searchStocks = async (query) => {
  if (allSymbolsCache.length === 0) return [];
  return filterStocks(allSymbolsCache, query);
};

const filterStocks = (stocks, query) => {
  if (!query || typeof query !== 'string') return [];
  const searchTerm = query.trim().toLowerCase();
  if (searchTerm.length < 2) return [];
  
  const matches = [];
  for (const stock of stocks) {
    if (!stock || !stock.symbol) continue;
    const sym = stock.symbol.toLowerCase();
    const name = (stock.name || '').toLowerCase();
    if (sym.includes(searchTerm) || name.includes(searchTerm)) matches.push(stock);
    if (matches.length >= 100) break;
  }
  return matches;
};

module.exports = {
  fetchLatestNews,
  searchStocks,
  fetchEventCalendar // <--- Only this new function is needed for the calendar
};