const axios = require('axios');
const pdf = require('pdf-parse');
const pool = require('../config/database');
const { sendWhatsAppAlert } = require('./twilio.service');
const { sendTelegramAlert } = require('./telegram.service');
const { summarizeNews } = require('./grok.service');
const { NSE_ANNOUNCEMENTS_URL } = require('../config/constants');

// ============================================
// Keywords for Classification
// ============================================

const CRITICAL_KEYWORDS = [
  'resignation', 'director', 'ceo', 'cfo', 'auditor',
  'fraud', 'investigation', 'penalty', 'litigation',
  'default', 'suspension', 'sebi', 'regulatory action'
];

const IMPORTANT_KEYWORDS = [
  'board meeting', 'agm', 'egm', 'dividend', 'buyback',
  'acquisition', 'merger', 'financial results', 'q1', 'q2', 'q3', 'q4'
];

// ============================================
// Notification Service Class
// ============================================

class NotificationService {
  constructor() {
    this.seenAnnouncements = new Set();
  }

  // ============================================
  // Main Processing Function
  // ============================================

  async checkAndNotify() {
    try {
      console.log('[INFO] Checking for new announcements...');
      
      // Load previously processed announcements
      await this.loadProcessedAnnouncements();
      
      // Fetch latest announcements
      const announcements = await this.fetchNSEAnnouncements();
      
      // Filter new ones
      const newAnnouncements = announcements.filter(
        ann => !this.seenAnnouncements.has(ann.seq_id)
      );

      if (newAnnouncements.length > 0) {
        console.log(`[INFO] Found ${newAnnouncements.length} new announcements`);
        
        for (const announcement of newAnnouncements) {
          this.seenAnnouncements.add(announcement.seq_id);
          await this.processAnnouncement(announcement);
        }
      } else {
        console.log('[INFO] No new announcements found');
      }
      
    } catch (error) {
      console.error('[ERROR] Check and notify failed:', error.message);
    }
  }

  // ============================================
  // Load Previously Processed Announcements
  // ============================================

  async loadProcessedAnnouncements() {
    try {
      const query = 'SELECT DISTINCT news_seq_id FROM sent_news';
      const { rows } = await pool.query(query);
      
      rows.forEach(row => {
        if (row.news_seq_id) {
          this.seenAnnouncements.add(row.news_seq_id);
        }
      });

      console.log(`[INFO] Loaded ${this.seenAnnouncements.size} previously processed announcements`);
    } catch (error) {
      console.error('[ERROR] Failed to load processed announcements:', error.message);
    }
  }

  // ============================================
  // Fetch NSE Announcements - FIXED
  // ============================================

  async fetchNSEAnnouncements() {
    try {
      const response = await axios.get(NSE_ANNOUNCEMENTS_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000
      });

      // FIXED: Direct array response, not nested
      const announcements = Array.isArray(response.data) ? response.data : [];
      
      console.log(`[INFO] Fetched ${announcements.length} announcements from NSE`);
      
      // Debug: Log first announcement structure
      if (announcements.length > 0) {
        console.log('[DEBUG] First announcement:', JSON.stringify(announcements[0], null, 2));
      }
      
      return announcements;
      
    } catch (error) {
      console.error('[ERROR] Failed to fetch NSE announcements:', error.message);
      return [];
    }
  }

  // ============================================
  // Process Individual Announcement - FIXED
  // ============================================

  async processAnnouncement(announcement) {
    try {
      // FIXED: Use direct properties from the API response
      const symbol = announcement.symbol;
      const desc = announcement.desc;
      const seqId = announcement.seq_id;
      const attchmnt = announcement.attchmntFile;
      const date = announcement.an_dt;
      const companyName = announcement.sm_name;

      if (!symbol) {
        console.log('[WARN] Skipping announcement without symbol');
        return;
      }

      console.log(`[INFO] Processing announcement for ${symbol}: ${desc}`);
      
      // Get users watching this symbol from database
      const watchers = await this.getWatchlistUsers(symbol);
      
      if (watchers.length === 0) {
        console.log(`[INFO] No watchers for ${symbol}, skipping`);
        return;
      }

      console.log(`[INFO] Processing ${symbol} for ${watchers.length} users`);

      // Classify announcement type
      const notificationType = this.classifyAnnouncement(desc);
      
      // Generate message based on type
      const message = await this.generateMessage(
        { symbol, desc, seqId, attchmnt, date, companyName },
        notificationType
      );

      // Send to all watchers
      for (const user of watchers) {
        try {
          if (user.login_method === 'telegram' && user.telegram_chat_id) {
            // Send via Telegram
            await sendTelegramAlert(user.telegram_chat_id, symbol, message);
            console.log(`[INFO] Alert sent via Telegram to user ${user.id}`);
          } else if (user.login_method === 'whatsapp' && user.phone_number) {
            // Send via WhatsApp
            await sendWhatsAppAlert(user.phone_number, symbol, message);
            console.log(`[INFO] Alert sent via WhatsApp to user ${user.id}`);
          } else {
            console.warn(`[WARN] No valid contact info for user ${user.id} (login_method: ${user.login_method})`);
          }
          
          // Log notification in database
          await this.logNotification(user.id, symbol, desc, message, seqId);
        } catch (error) {
          const contactInfo = user.login_method === 'telegram' ? user.telegram_chat_id : user.phone_number;
          console.error(`[ERROR] Failed to send ${user.login_method} alert to ${contactInfo}:`, error.message);
        }
      }

      // Mark announcement as processed
      await this.markAsProcessed(seqId, symbol);
      
    } catch (error) {
      console.error('[ERROR] Process announcement failed:', error.message);
    }
  }

  // ============================================
  // Get Users Watching a Stock
  // ============================================

  async getWatchlistUsers(symbol) {
    try {
      const query = `
        SELECT DISTINCT u.id, u.phone_number, u.login_method, u.telegram_chat_id
        FROM users u
        INNER JOIN alert_stocks a ON u.id = a.user_id
        WHERE a.stock_symbol = $1 AND a.is_enabled = TRUE AND u.is_verified = TRUE
      `;
      
      const { rows } = await pool.query(query, [symbol.toUpperCase()]);
      
      // Debug log
      console.log(`[DEBUG] Found ${rows.length} watchers for ${symbol}`);
      
      return rows;
    } catch (error) {
      console.error('[ERROR] Failed to get watchlist users:', error.message);
      return [];
    }
  }

  // ============================================
  // Classify Announcement Type
  // ============================================

  classifyAnnouncement(desc) {
    const descLower = (desc || '').toLowerCase();
    
    if (CRITICAL_KEYWORDS.some(kw => descLower.includes(kw))) {
      return 'CRITICAL';
    }
    
    if (IMPORTANT_KEYWORDS.some(kw => descLower.includes(kw))) {
      return 'IMPORTANT';
    }
    
    return 'ROUTINE';
  }

  // ============================================
  // Generate WhatsApp Message
  // ============================================

  async generateMessage(announcement, type) {
    switch (type) {
      case 'CRITICAL':
        return await this.generateCriticalMessage(announcement);
      case 'IMPORTANT':
        return this.generateImportantMessage(announcement);
      case 'ROUTINE':
      default:
        return this.generateRoutineMessage(announcement);
    }
  }

  // ============================================
  // Routine Message (Template Only - No AI)
  // ============================================

  generateRoutineMessage(announcement) {
    const { symbol, desc, date, companyName } = announcement;
    
    return `🔔 *${symbol} Update*

📋 ${desc}

🏢 ${companyName || 'NSE'}
🕐 ${date || new Date().toLocaleDateString()}

_Routine disclosure - No immediate action required_`;
  }

  // ============================================
  // Important Message (Template + Context)
  // ============================================

  generateImportantMessage(announcement) {
    const { symbol, desc, date, companyName } = announcement;
    const context = this.getAnnouncementContext(desc);
    
    return `⚡ *${symbol} - Important Update*

📋 ${desc}

${context}

🏢 ${companyName || 'NSE'}
🕐 ${date || new Date().toLocaleDateString()}

_Review recommended_`;
  }

  // ============================================
  // Critical Message (AI Analysis)
  // ============================================

  async generateCriticalMessage(announcement) {
    const { symbol, desc, date, companyName, attchmnt } = announcement;
    
    let aiInsight = 'Please review the announcement carefully.';
    
    // Try to get AI insight from Gemini
    if (attchmnt) {
      try {
        const pdfText = await this.extractPDFSnippet(attchmnt);
        if (pdfText) {
          aiInsight = await summarizeNews(
            `${desc}\n\n${pdfText}`,
            symbol,
            companyName || 'Company'
          );
        }
      } catch (error) {
        console.warn('[WARN] PDF extraction failed, using fallback:', error.message);
        aiInsight = await summarizeNews(desc, symbol, companyName || 'Company');
      }
    } else {
      aiInsight = await summarizeNews(desc, symbol, companyName || 'Company');
    }
    
    return `🚨 *${symbol} - CRITICAL ALERT*

📋 ${desc}

🤖 *Quick Analysis:*
${aiInsight}

🏢 ${companyName || 'NSE'}
🕐 ${date || new Date().toLocaleDateString()}

_⚠️ Immediate attention recommended_`;
  }

  // ============================================
  // Get Context for Announcement (No AI)
  // ============================================

  getAnnouncementContext(desc) {
    const descLower = (desc || '').toLowerCase();
    
    const contexts = {
      'board meeting': '📅 Board meeting scheduled. May discuss financials, dividends, or strategic decisions.',
      'dividend': '💰 Dividend announcement. Positive signal for shareholder returns.',
      'agm': '👥 Annual General Meeting. Review company performance and vote on resolutions.',
      'results': '📊 Financial results released. Check revenue, profit, and guidance.',
      'acquisition': '🤝 M&A activity. Potential growth opportunity or strategic expansion.',
      'buyback': '💵 Share buyback announced. Company confidence signal.',
    };

    for (const [keyword, context] of Object.entries(contexts)) {
      if (descLower.includes(keyword)) {
        return context;
      }
    }

    return '📢 Corporate announcement filed with exchange.';
  }
// ============================================
// Extract PDF Snippet (Smart Extraction)
// ============================================

async extractPDFSnippet(pdfUrl, maxChars = 6000) {
  try {
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    const data = await pdf(response.data);
    const rawText = data.text || "";

    if (!rawText || rawText.length < 200) {
      console.warn("[WARN] PDF contains very little readable text");
      return "";
    }

    // -----------------------------
    // Clean up extracted text
    // -----------------------------
    const cleanedText = rawText
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+/g, " ")
      .trim();

    // -----------------------------
    // If text is already small enough → return all
    // -----------------------------
    if (cleanedText.length <= maxChars) {
      console.log(`[INFO] Extracted ${cleanedText.length} chars from PDF (full text used)`);
      return cleanedText;
    }

    // -----------------------------
    // Otherwise → prioritize beginning (usually first page)
    // -----------------------------
    const sliced = cleanedText.slice(0, maxChars);

    console.log(
      `[INFO] Extracted ${sliced.length} chars from PDF (trimmed from ${cleanedText.length})`
    );

    return sliced;

  } catch (error) {
    console.error('[ERROR] PDF extraction failed:', error.message);
    return '';
  }
}


  // ============================================
  // Log Notification in Database
  // ============================================

  async logNotification(userId, symbol, newsTitle, aiSummary, newsSeqId) {
    try {
      const query = `
        INSERT INTO alert_history (user_id, stock_symbol, news_title, ai_summary, news_seq_id, whatsapp_sent)
        VALUES ($1, $2, $3, $4, $5, TRUE)
      `;
      
      await pool.query(query, [userId, symbol.toUpperCase(), newsTitle, aiSummary, newsSeqId]);
      console.log(`[INFO] Logged notification for user ${userId}`);
    } catch (error) {
      console.error('[ERROR] Failed to log notification:', error.message);
    }
  }

  // ============================================
  // Mark Announcement as Processed
  // ============================================

  async markAsProcessed(newsSeqId, symbol) {
    try {
      const query = `
        INSERT INTO sent_news (news_seq_id, stock_symbol)
        VALUES ($1, $2)
        ON CONFLICT (news_seq_id) DO NOTHING
      `;
      
      await pool.query(query, [newsSeqId, symbol.toUpperCase()]);
      console.log(`[INFO] Marked announcement ${newsSeqId} as processed`);
    } catch (error) {
      console.error('[ERROR] Failed to mark announcement as processed:', error.message);
    }
  }
}

// Export singleton instance
module.exports = new NotificationService();