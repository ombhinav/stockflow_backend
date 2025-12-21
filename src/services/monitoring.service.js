const cron = require('node-cron');
const pool = require('../config/database');
const { fetchLatestNews } = require('./nse.service');
const { summarizeNews } = require('./gemini.service');
const { sendWhatsAppAlert } = require('./twilio.service');

const processNewsAlerts = async () => {
  console.log('🔄 Starting news monitoring cycle...');

  try {
    // Fetch latest news from NSE
    const newsItems = await fetchLatestNews();
    
    if (newsItems.length === 0) {
      console.log('ℹ️ No news items fetched');
      return;
    }

    // Get all users with their alert stocks
    const usersQuery = `
      SELECT DISTINCT 
        u.id as user_id, 
        u.phone_number,
        as2.stock_symbol,
        as2.stock_name
      FROM users u
      JOIN alert_stocks as2 ON u.id = as2.user_id
      WHERE as2.is_enabled = TRUE
    `;
    
    const { rows: userAlerts } = await pool.query(usersQuery);
    
    if (userAlerts.length === 0) {
      console.log('ℹ️ No active alerts configured');
      return;
    }

    // Process each news item
    for (const news of newsItems) {
      const { symbol, seq_id, attchmntText, sm_name, desc } = news;
      
      if (!symbol || !seq_id) continue;

      // Check if this news was already sent
      const checkQuery = 'SELECT id FROM sent_news WHERE news_seq_id = $1';
      const { rows: existing } = await pool.query(checkQuery, [seq_id]);
      
      if (existing.length > 0) {
        continue; // Already sent
      }

      // Find users subscribed to this stock
      const subscribedUsers = userAlerts.filter(
        alert => alert.stock_symbol === symbol
      );

      if (subscribedUsers.length === 0) continue;

      // Generate AI summary
      const newsContent = attchmntText || desc || 'New announcement available';
      const aiSummary = await summarizeNews(newsContent, symbol, sm_name);

      // Send alerts to all subscribed users
      for (const user of subscribedUsers) {
        try {
          const result = await sendWhatsAppAlert(
            user.phone_number,
            symbol,
            aiSummary
          );

          // Log alert history
          await pool.query(
            `INSERT INTO alert_history 
            (user_id, stock_symbol, news_title, news_content, ai_summary, news_seq_id, whatsapp_sent)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.user_id, symbol, desc, newsContent, aiSummary, seq_id, result.success]
          );

          console.log(`✅ Alert sent to ${user.phone_number} for ${symbol}`);
        } catch (error) {
          console.error(`❌ Failed to send alert to ${user.phone_number}:`, error.message);
        }
      }

      // Mark news as sent
      await pool.query(
        'INSERT INTO sent_news (news_seq_id, stock_symbol) VALUES ($1, $2)',
        [seq_id, symbol]
      );
    }

    console.log('✅ News monitoring cycle completed');
  } catch (error) {
    console.error('❌ Monitoring error:', error);
  }
};

const startMonitoring = () => {
  const { NEWS_CHECK_INTERVAL_MINUTES } = require('../config/constants');
  const interval = NEWS_CHECK_INTERVAL_MINUTES;
  
  // Run every X minutes
  cron.schedule(`*/${interval} * * * *`, () => {
    console.log(`\n⏰ Cron job triggered at ${new Date().toLocaleString()}`);
    processNewsAlerts();
  });

  // Also run immediately on startup
  console.log('🚀 News monitoring service started');
  processNewsAlerts();
};

module.exports = { startMonitoring };