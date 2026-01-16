const axios = require('axios');

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

/**
 * Get Telegram bot instance
 */
const getTelegramBot = () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }
  return `${TELEGRAM_API_BASE}${process.env.TELEGRAM_BOT_TOKEN}`;
};

/**
 * Generate 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP via Telegram
 * @param {string} chatId - Telegram chat ID
 * @param {string} otp - The OTP code
 */
const sendTelegramOTP = async (chatId, otp) => {
  try {
    const botUrl = getTelegramBot();
    const message = `🔐 *StockFlow Verification*\n\nYour verification code is: \`${otp}\`\n\n⏱ This code expires in 10 minutes.\n\n_Please do not share this code with anyone._`;

    const response = await axios.post(`${botUrl}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    });

    console.log(`✅ Telegram OTP sent to chat ${chatId}`);
    return { 
      success: true, 
      messageId: response.data.result.message_id,
      chatInfo: response.data.result.chat
    };
  } catch (error) {
    console.error('❌ Telegram OTP error:', error.response?.data || error.message);
    
    // Check for specific Telegram API errors
    const errorDescription = error.response?.data?.description || '';
    
    if (errorDescription.includes('bot was blocked') || errorDescription.includes('user is deactivated')) {
      throw new Error('Cannot send message. Please unblock the bot and try again.');
    }
    
    if (errorDescription.includes('chat not found') || errorDescription.includes('PEER_ID_INVALID')) {
      throw new Error('Invalid Telegram chat ID. Please make sure you have started a chat with @stockfloww_bot first.');
    }
    
    if (errorDescription.includes('Forbidden')) {
      throw new Error('Bot cannot message you. Please start a conversation with @stockfloww_bot first by sending /start.');
    }
    
    throw new Error('Failed to send OTP via Telegram. Please ensure you have started the bot.');
  }
};

/**
 * Send stock alert via Telegram
 * @param {string} chatId - Telegram chat ID
 * @param {string} stockSymbol - Stock symbol
 * @param {string} summary - AI-generated summary
 */
const sendTelegramAlert = async (chatId, stockSymbol, summary) => {
  try {
    const botUrl = getTelegramBot();
    const message = `🔔 *StockFlow Alert*\n\n📊 *${stockSymbol}*\n\n${summary}\n\n_Powered by StockFlow_`;

    const response = await axios.post(`${botUrl}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    });

    console.log(`✅ Telegram alert sent to chat ${chatId}`);
    return { success: true, messageId: response.data.result.message_id };
  } catch (error) {
    console.error('❌ Telegram alert error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Verify Telegram chat ID by attempting to get chat info
 * Note: This will only work if the user has started the bot
 * @param {string} chatId - Telegram chat ID to verify
 */
const verifyTelegramChatId = async (chatId) => {
  try {
    const botUrl = getTelegramBot();
    
    // Try to get chat information
    const response = await axios.get(`${botUrl}/getChat`, {
      params: { chat_id: chatId },
      timeout: 5000
    });

    const chatData = response.data.result;
    
    return {
      valid: true,
      username: chatData.username,
      firstName: chatData.first_name,
      type: chatData.type
    };
  } catch (error) {
    const errorDescription = error.response?.data?.description || error.message;
    console.error('❌ Telegram chat verification error:', errorDescription);
    
    // Provide specific error messages
    let reason = 'Invalid chat ID';
    
    if (errorDescription.includes('chat not found') || errorDescription.includes('PEER_ID_INVALID')) {
      reason = 'Chat ID not found. Please verify you copied the correct ID from @userinfobot.';
    } else if (errorDescription.includes('Forbidden')) {
      reason = 'Please start a conversation with @stockfloww_bot first by sending /start.';
    }
    
    return { 
      valid: false, 
      reason: reason,
      errorDescription: errorDescription
    };
  }
};

/**
 * Get bot information
 */
const getBotInfo = async () => {
  try {
    const botUrl = getTelegramBot();
    const response = await axios.get(`${botUrl}/getMe`);
    return response.data.result;
  } catch (error) {
    console.error('❌ Failed to get bot info:', error.message);
    throw new Error('Failed to connect to Telegram bot');
  }
};

module.exports = {
  generateOTP,
  sendTelegramOTP,
  sendTelegramAlert,
  verifyTelegramChatId,
  getBotInfo
};