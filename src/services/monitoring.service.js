const cron = require('node-cron');
const notificationService = require('./notification.service');

const processNewsAlerts = async () => {
  console.log('🔄 Starting news monitoring cycle...');

  try {
    // Use the new notification service to check and send announcements
    await notificationService.checkAndNotify();
    console.log('✅ News monitoring cycle completed');
  } catch (error) {
    console.error('❌ News monitoring error:', error.message);
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