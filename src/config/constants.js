const newsCheckInterval = parseInt(process.env.NEWS_CHECK_INTERVAL_MINUTES || '15', 10);

if (isNaN(newsCheckInterval) || newsCheckInterval < 1 || newsCheckInterval > 59) {
  throw new Error('NEWS_CHECK_INTERVAL_MINUTES must be a number between 1 and 59');
}

module.exports = {
  OTP_EXPIRY_MINUTES: 10,
  OTP_LENGTH: 6,
  NSE_ANNOUNCEMENTS_URL: 'https://www.nseindia.com/api/corporate-announcements?index=equities',
  GEMINI_MODEL: 'gemini-pro',
  NEWS_CHECK_INTERVAL_MINUTES: newsCheckInterval,
};