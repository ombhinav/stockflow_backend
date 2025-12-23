const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { NSE_ANNOUNCEMENTS_URL } = require('../config/constants');
const { NseIndia } = require('stock-nse-india');

// Initialize NSE India client
const nseIndia = new NseIndia();

// Cache file paths
const CACHE_DIR = path.join(__dirname, '../../data');
const CACHE_FILE = path.join(CACHE_DIR, 'stocks-cache.json');
const CACHE_TIMESTAMP_FILE = path.join(CACHE_DIR, 'stocks-cache-timestamp.json');

// Ensure data directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Cache for all symbols with company names
let allSymbolsCache = [];
let isCacheReady = false;
let companyNameCache = {}; // Cache for company names fetched dynamically

// Popular NSE stocks fallback list (used until real list loads)
const POPULAR_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFC', 'LT', 'HCLTECH', 'WIPRO', 'MARUTI', 'AXIS', 'ICICIBANK',
  'SBIN', 'HINDUSTAN', 'BAJAJFINSV', 'BAJAJ-AUTO', 'ITC', 'SUNPHARMA', 'ADANIPORTS', 'ASIANPAINT', 'TITAN', 'M&M',
  'POWERGRID', 'NTPC', 'COALINDIA', 'JSWSTEEL', 'HINDALCO', 'APOLLOHOSP', 'DRREDDY', 'BHARTIARTL', 'ONGC', 'INDIGO',
  'FLRTY', 'GAIL', 'GRASIM', 'HAVELLS', 'HEROMOTOCORP', 'IDEA', 'IDFC', 'IDFCBANK', 'IOC', 'KPITTECH',
  'LTTS', 'LUPIN', 'NESTLEIND', 'PAGEIND', 'PIDILITIND', 'SAILIND', 'SRIIND', 'TATACHEM', 'TATAMOTORS', 'TATAPOWER',
  'TATASTEEL', 'TECHM', 'TORNTPHARM', 'UPL', 'ULTRACEMCO', 'VOLTAS', 'WHIRLPOOL', 'YESBANK', 'ZEEL', 'ETERNAL'
];

// Load persisted cache from disk
const loadPersistedCache = () => {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      const cache = JSON.parse(data);
      console.log(`📦 Loaded persisted cache with ${cache.length} stocks`);
      return cache;
    }
  } catch (error) {
    console.warn('⚠️ Could not load persisted cache:', error.message);
  }
  return [];
};

// Save cache to disk
const savePersistedCache = (stocks) => {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(stocks, null, 2));
    fs.writeFileSync(CACHE_TIMESTAMP_FILE, JSON.stringify({ lastUpdated: new Date().toISOString() }));
    console.log(`💾 Persisted cache with ${stocks.length} stocks to disk`);
  } catch (error) {
    console.error('❌ Failed to save cache:', error.message);
  }
};

// Compare old and new symbol lists, return only new symbols
const findNewSymbols = (oldStocks, newSymbols) => {
  const oldSymbolSet = new Set(oldStocks.map(s => s.symbol));
  const newSymbolsToFetch = newSymbols.filter(s => !oldSymbolSet.has(s));
  
  if (newSymbolsToFetch.length > 0) {
    console.log(`🆕 Found ${newSymbolsToFetch.length} new stocks to fetch`);
  }
  
  return newSymbolsToFetch;
};

// Fetch company name for a given symbol
const getCompanyName = async (symbol) => {
  // Check cache first
  if (companyNameCache[symbol]) {
    return companyNameCache[symbol];
  }

  try {
    // Try to get company info from NSE India library
    const quoteData = await nseIndia.getEquityDetails(symbol);
    
    if (quoteData && quoteData.info) {
      const companyName = quoteData.info.companyName || quoteData.info.companyShortName || symbol;
      companyNameCache[symbol] = companyName;
      return companyName;
    }
  } catch (error) {
    console.log(`⚠️ Could not fetch company name for ${symbol}: ${error.message}`);
  }

  // Fallback: use symbol as name and cache it
  companyNameCache[symbol] = symbol;
  return symbol;
};

// Start background task to load symbols and fetch company names intelligently
(async () => {
  try {
    console.log('⏳ Starting NSE symbols cache initialization...');
    
    // Step 1: Load persisted cache
    const persistedCache = loadPersistedCache();
    
    // Step 2: Fetch current symbol list
    console.log('📡 Fetching current symbol list from NSE...');
    const currentSymbols = await nseIndia.getAllStockSymbols();
    
    if (currentSymbols && Array.isArray(currentSymbols) && currentSymbols.length > 0) {
      // Step 3: Find new symbols
      const newSymbols = findNewSymbols(persistedCache, currentSymbols);
      
      // Step 4: Start with persisted cache as base
      allSymbolsCache = [...persistedCache];
      
      // Step 5: Add new symbols (will fetch details progressively)
      const newStocksToAdd = newSymbols.map(s => ({
        symbol: s,
        name: s  // Initially use symbol, will be enriched as names are fetched
      }));
      allSymbolsCache = [...allSymbolsCache, ...newStocksToAdd];
      
      isCacheReady = true;
      console.log(`✅ Cache ready: ${persistedCache.length} persisted + ${newSymbols.length} new = ${allSymbolsCache.length} total stocks`);

      // Background task: Fetch company names only for new symbols
      if (newSymbols.length > 0) {
        console.log(`📡 Fetching company names for ${newSymbols.length} new stocks in background...`);
        let fetchedCount = 0;
        
        for (const symbol of newSymbols) {
          try {
            const stock = allSymbolsCache.find(s => s.symbol === symbol);
            if (stock) {
              const companyName = await getCompanyName(stock.symbol);
              stock.name = companyName;
              fetchedCount++;
              
              // Log progress every 50 stocks
              if (fetchedCount % 50 === 0) {
                console.log(`   Fetched ${fetchedCount}/${newSymbols.length} new stock details...`);
              }
            }
          } catch (error) {
            continue;
          }
        }
        console.log(`✅ Enriched ${fetchedCount} new stocks with company names`);
        
        // Step 6: Save back to persistence
        savePersistedCache(allSymbolsCache);
      } else {
        console.log('✅ Cache is up to date, no new stocks');
      }
    } else {
      console.warn('⚠️ NSE returned no symbols');
      
      // Use persisted cache if available, otherwise fallback
      if (persistedCache.length > 0) {
        allSymbolsCache = persistedCache;
        isCacheReady = true;
        console.log(`✅ Using persisted cache with ${persistedCache.length} stocks`);
      } else {
        console.log('⚠️ Using fallback stock list');
        allSymbolsCache = POPULAR_STOCKS.map(s => ({
          symbol: s,
          name: s
        }));
        isCacheReady = true;

        // Fetch company names for popular stocks
        console.log('📡 Fetching company names for popular stocks...');
        let fetchedCount = 0;
        for (const stock of allSymbolsCache) {
          try {
            const companyName = await getCompanyName(stock.symbol);
            stock.name = companyName;
            fetchedCount++;
          } catch (error) {
            continue;
          }
        }
        
        // Save fallback list
        savePersistedCache(allSymbolsCache);
      }
    }
  } catch (error) {
    console.error('❌ Failed to initialize cache:', error.message);
    
    // Fallback to persisted cache
    const persistedCache = loadPersistedCache();
    if (persistedCache.length > 0) {
      allSymbolsCache = persistedCache;
      isCacheReady = true;
      console.log(`⚠️ Fell back to persisted cache with ${persistedCache.length} stocks`);
    } else {
      console.log('⚠️ Using fallback stock list');
      allSymbolsCache = POPULAR_STOCKS.map(s => ({
        symbol: s,
        name: s
      }));
      isCacheReady = true;
    }
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