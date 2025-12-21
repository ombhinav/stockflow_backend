const axios = require('axios');
const { NSE_ANNOUNCEMENTS_URL } = require('../config/constants');
const { NseIndia } = require('stock-nse-india');

// Initialize NSE India client
const nseIndia = new NseIndia();

// Cache for all symbols
let allSymbolsCache = [];
let isCacheReady = false;

// Popular NSE stocks fallback list (used until real list loads)
const POPULAR_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFC', 'LT', 'HCLTECH', 'WIPRO', 'MARUTI', 'AXIS', 'ICICIBANK',
  'SBIN', 'HINDUSTAN', 'BAJAJFINSV', 'BAJAJ-AUTO', 'ITC', 'SUNPHARMA', 'ADANIPORTS', 'ASIANPAINT', 'TITAN', 'M&M',
  'POWERGRID', 'NTPC', 'COALINDIA', 'JSWSTEEL', 'HINDALCO', 'APOLLOHOSP', 'DRREDDY', 'BHARTIARTL', 'ONGC', 'INDIGO',
  'FLRTY', 'GAIL', 'GRASIM', 'HAVELLS', 'HEROMOTOCORP', 'IDEA', 'IDFC', 'IDFCBANK', 'IOC', 'KPITTECH',
  'LTTS', 'LUPIN', 'NESTLEIND', 'PAGEIND', 'PIDILITIND', 'SAILIND', 'SRIIND', 'TATACHEM', 'TATAMOTORS', 'TATAPOWER',
  'TATASTEEL', 'TECHM', 'TORNTPHARM', 'UPL', 'ULTRACEMCO', 'VOLTAS', 'WHIRLPOOL', 'YESBANK', 'ZEEL', 'ETERNAL'
];

// Start background task to load symbols (fire and forget)
(async () => {
  try {
    console.log('⏳ Starting NSE symbols cache in background...');
    const symbols = await nseIndia.getAllStockSymbols();
    
    if (symbols && Array.isArray(symbols) && symbols.length > 0) {
      allSymbolsCache = symbols.map(s => ({
        symbol: s,
        name: s
      }));
      isCacheReady = true;
      console.log(`✅ NSE cache ready with ${allSymbolsCache.length} stocks`);
    } else {
      console.warn('⚠️ NSE returned no symbols, using fallback list');
      allSymbolsCache = POPULAR_STOCKS.map(s => ({
        symbol: s,
        name: s
      }));
      isCacheReady = true;
    }
  } catch (error) {
    console.error('❌ Failed to load NSE cache:', error.message);
    console.log('⚠️ Using fallback stock list');
    allSymbolsCache = POPULAR_STOCKS.map(s => ({
      symbol: s,
      name: s
    }));
    isCacheReady = true;
  }
})();

// NSE requires specific headers to prevent blocking
const getNSEHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.nseindia.com/'
});

const fetchLatestNews = async () => {
  try {
    const response = await axios.get(NSE_ANNOUNCEMENTS_URL, {
      headers: getNSEHeaders(),
      timeout: 10000
    });

    if (!response.data) {
      console.warn('⚠️ NSE API returned empty response');
      return [];
    }

    // Handle both array and object responses
    let newsItems = Array.isArray(response.data) ? response.data : response.data.data || [];
    
    if (!Array.isArray(newsItems)) {
      console.warn('⚠️ NSE API response is not iterable, attempting conversion');
      return [];
    }

    console.log(`✅ Fetched ${newsItems.length} news items from NSE`);
    return newsItems;
  } catch (error) {
    console.error('❌ NSE API error:', error.message);
    return [];
  }
};

// Fetch all NSE stocks dynamically using stock-nse-india package
const searchStocks = async (query) => {
  try {
    // Return empty if cache not ready (will load within seconds)
    if (allSymbolsCache.length === 0) {
      console.log('⚠️ NSE cache not loaded yet, try again in a moment');
      return [];
    }

    console.log(`🔍 Searching for: "${query}"`);
    const results = filterStocks(allSymbolsCache, query);
    console.log(`📊 Found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('❌ searchStocks error:', error.message);
    return [];
  }
};

// Helper function to filter stocks based on query
const filterStocks = (stocks, query) => {
  // Validate query
  if (!query || typeof query !== 'string') {
    console.log('⚠️ Invalid query, returning empty');
    return [];
  }

  const searchTerm = query.trim().toLowerCase();
  
  if (searchTerm.length < 2) {
    console.log('⚠️ Query too short (< 2 chars), returning empty');
    return [];
  }

  console.log(`🔎 Filtering ${stocks.length} stocks for term: "${searchTerm}"`);
  
  try {
    const matches = [];
    
    for (const stock of stocks) {
      if (!stock || !stock.symbol) continue;
      
      const sym = stock.symbol.toLowerCase();
      const name = (stock.name || '').toLowerCase();
      
      if (sym.includes(searchTerm) || name.includes(searchTerm)) {
        matches.push(stock);
      }
      
      // Limit results for performance
      if (matches.length >= 100) break;
    }
    
    console.log(`   ✅ Found ${matches.length} matches`);
    return matches;
  } catch (error) {
    console.error('   ❌ Error filtering:', error.message);
    return [];
  }
};

module.exports = {
  fetchLatestNews,
  searchStocks
};