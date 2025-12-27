const express = require('express');
const router = express.Router();
const axios = require('axios');
const { searchStocks } = require('../services/nse.service');
const { summarizeNews } = require('../services/gemini.service');
const { authenticate } = require('../middleware/auth.middleware');
const pool = require('../config/database');
const rateLimit = require('express-rate-limit');

// ============================================
// AI Analysis Rate Limiter
// ============================================

const aiAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per user per 15 minutes
  keyGenerator: (req, res) => req.user?.id || req.ip, // Rate limit per user ID or IP
  message: 'Too many AI analysis requests. Maximum 5 per 15 minutes.',
  standardHeaders: false,
  skip: (req, res) => !req.user, // Skip if not authenticated
});

// GET /api/stocks/search?q=reliance
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ stocks: [] });
    }

    const stocks = await searchStocks(q);
    res.json({ stocks });
  } catch (error) {
    console.error('Stock search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ============================================
// GET /api/stocks/announcements - Fetch NSE Announcements
// ============================================

router.get('/announcements', authenticate, async (req, res) => {
  try {
    console.log('[INFO] Fetching NSE announcements...');
    
    let announcements = [];
    
    try {
      const response = await axios.get(
        'https://www.nseindia.com/api/corporate-announcements?index=equities',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.nseindia.com/',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
          },
          timeout: 15000,
          withCredentials: false
        }
      );

      // Parse NSE API response - handle both array and object formats
      let data = response.data;
      if (Array.isArray(data)) {
        announcements = data.map((item, index) => ({
          id: item.seq_id || index,
          symbol: item.symbol || item.xchange_traded_scrip_code || '',
          desc: item.desc || '',
          attchmntText: item.attchmntText || '',
          an_dt: item.an_dt || new Date().toLocaleDateString(),
          sm_name: item.sm_name || '',
          smIndustry: item.smIndustry || '',
          pdf_url: item.attachment || item.attchmntFile || item.file_name || '',
          category: classifyAnnouncement(item.subject || item.desc || ''),
          is_red_flag: isRedFlag(item.subject || item.desc || ''),
          seq_id: item.seq_id
        }));
      } else if (data && data.data && Array.isArray(data.data)) {
        announcements = data.data.map((item, index) => ({
          id: item.seq_id || index,
          symbol: item.symbol || item.xchange_traded_scrip_code || '',
          desc: item.subject || item.desc || '',
          attchmntText: item.attchmntText || '',
          an_dt: item.ann_date || item.an_dt || new Date().toLocaleDateString(),
          sm_name: item.company || item.sm_name || item.company_name || '',
          smIndustry: item.smIndustry || '',
          pdf_url: item.attachment || item.attchmntFile || item.file_name || '',
          category: classifyAnnouncement(item.subject || item.desc || ''),
          is_red_flag: isRedFlag(item.subject || item.desc || ''),
          seq_id: item.seq_id
        }));
      } else {
        console.log('[WARN] NSE API returned unexpected format');
      }
    } catch (nsError) {
      console.warn('[WARN] NSE API call failed, using sample data:', nsError.message);
      // Use sample data for testing
      announcements = getMockAnnouncements();
    }

    res.json({ 
      success: true, 
      announcements,
      count: announcements.length
    });
  } catch (error) {
    console.error('[ERROR] Failed to fetch announcements:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch announcements',
      announcements: []
    });
  }
});

// ============================================
// POST /api/stocks/analyze - Get AI Analysis
// ============================================

router.post('/analyze', authenticate, aiAnalysisLimiter, async (req, res) => {
  try {
    const { symbol, description, content } = req.body;

    if (!symbol || !description) {
      return res.status(400).json({ error: 'Symbol and description required' });
    }

    // Generate AI analysis using Gemini
    const analysis = await summarizeNews(content || description, symbol, 'Company');

    res.json({ 
      success: true, 
      analysis,
      symbol
    });
  } catch (error) {
    console.error('AI Analysis error:', error);
    res.status(500).json({ error: 'Failed to generate analysis' });
  }
});

// ============================================
// Helper Functions
// ============================================

const CRITICAL_KEYWORDS = [
  'resignation', 'director', 'ceo', 'cfo', 'auditor',
  'fraud', 'investigation', 'penalty', 'litigation',
  'default', 'suspension', 'sebi', 'regulatory action',
  'delisting', 'insolvency', 'bankruptcy'
];

const IMPORTANT_KEYWORDS = [
  'board meeting', 'agm', 'egm', 'dividend', 'buyback',
  'acquisition', 'merger', 'financial results', 'q1', 'q2', 'q3', 'q4',
  'ipo', 'rights issue', 'bonus', 'split'
];

const GOVERNANCE_KEYWORDS = [
  'appointment', 'resignation', 'director', 'md', 'chairman',
  'auditor', 'committee', 'governance'
];

function classifyAnnouncement(text) {
  const lower = (text || '').toLowerCase();
  
  if (GOVERNANCE_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'governance';
  }
  if (CRITICAL_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'litigation';
  }
  if (IMPORTANT_KEYWORDS.some(kw => lower.includes(kw))) {
    return lower.includes('financial') || lower.includes('result') ? 'financial' : 'regulatory';
  }
  
  return 'routine';
}

function isRedFlag(text) {
  const lower = (text || '').toLowerCase();
  return CRITICAL_KEYWORDS.some(kw => lower.includes(kw));
}

function getMockAnnouncements() {
  return [
    {
      id: 1,
      symbol: 'RELIANCE',
      desc: 'Board meeting scheduled to discuss quarterly financial results Q3 FY2025',
      attchmntText: 'Board meeting scheduled to discuss quarterly financial results Q3 FY2025',
      an_dt: new Date().toLocaleDateString(),
      sm_name: 'Reliance Industries Limited',
      smIndustry: 'Oil & Gas',
      pdf_url: '',
      category: classifyAnnouncement('financial results'),
      is_red_flag: false,
      seq_id: 1
    },
    {
      id: 2,
      symbol: 'TCS',
      desc: 'Dividend announcement - Rs. 50 per share interim dividend approved',
      attchmntText: 'Dividend announcement - Rs. 50 per share interim dividend approved',
      an_dt: new Date(Date.now() - 86400000).toLocaleDateString(),
      sm_name: 'Tata Consultancy Services',
      smIndustry: 'IT',
      pdf_url: '',
      category: classifyAnnouncement('dividend'),
      is_red_flag: false,
      seq_id: 2
    },
    {
      id: 3,
      symbol: 'INFY',
      desc: 'Appointment of new Chief Financial Officer - Mr. Jayesh Sanghrajka',
      attchmntText: 'Appointment of new Chief Financial Officer - Mr. Jayesh Sanghrajka',
      an_dt: new Date(Date.now() - 2 * 86400000).toLocaleDateString(),
      sm_name: 'Infosys Limited',
      smIndustry: 'IT',
      pdf_url: '',
      category: classifyAnnouncement('appointment cfo'),
      is_red_flag: false,
      seq_id: 3
    },
    {
      id: 4,
      symbol: 'HDFC',
      desc: 'Acquisition completed - Strategic acquisition of fintech startup for digital banking expansion',
      attchmntText: 'Acquisition completed - Strategic acquisition of fintech startup for digital banking expansion',
      an_dt: new Date(Date.now() - 3 * 86400000).toLocaleDateString(),
      sm_name: 'HDFC Bank Limited',
      smIndustry: 'Banking',
      pdf_url: '',
      category: classifyAnnouncement('acquisition'),
      is_red_flag: false,
      seq_id: 4
    }
  ];
}

module.exports = router;