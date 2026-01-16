const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { generateOTP: generateTwilioOTP, sendWhatsAppOTP } = require('../services/twilio.service');
const { generateOTP: generateTelegramOTP, sendTelegramOTP } = require('../services/telegram.service');
const { generateToken } = require('../utils/jwt.util');
const { OTP_EXPIRY_MINUTES } = require('../config/constants');

// Demo credentials for testing
const DEMO_PHONE = '9999999999';
const DEMO_TELEGRAM_ID = '999999999';
const DEMO_OTP = '000000';

// POST /api/auth/register - Send OTP (WhatsApp or Telegram)
router.post('/register', async (req, res) => {
  try {
    const { phoneNumber, telegramChatId, loginMethod } = req.body;

    // Validate login method
    if (!loginMethod || !['whatsapp', 'telegram'].includes(loginMethod)) {
      return res.status(400).json({ error: 'Invalid login method. Must be "whatsapp" or "telegram"' });
    }

    // Handle WhatsApp registration
    if (loginMethod === 'whatsapp') {
      if (!phoneNumber || phoneNumber.length !== 10) {
        return res.status(400).json({ error: 'Invalid phone number' });
      }

      // Demo mode for WhatsApp
      if (phoneNumber === DEMO_PHONE) {
        console.log('📱 WhatsApp Demo mode activated - Using test OTP');
        const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        
        const query = `
          INSERT INTO users (phone_number, otp, otp_expires_at, login_method)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (phone_number) 
          DO UPDATE SET otp = $2, otp_expires_at = $3, login_method = $4
          RETURNING id
        `;
        
        await pool.query(query, [phoneNumber, DEMO_OTP, otpExpiresAt, 'whatsapp']);
        
        return res.json({ 
          success: true, 
          message: 'Demo OTP ready: Use 000000',
          expiresIn: OTP_EXPIRY_MINUTES,
          demo: true,
          loginMethod: 'whatsapp'
        });
      }

      // Production WhatsApp mode
      const otp = generateTwilioOTP();
      const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      const query = `
        INSERT INTO users (phone_number, otp, otp_expires_at, login_method)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (phone_number) 
        DO UPDATE SET otp = $2, otp_expires_at = $3, login_method = $4
        RETURNING id
      `;

      await pool.query(query, [phoneNumber, otp, otpExpiresAt, 'whatsapp']);
      await sendWhatsAppOTP(phoneNumber, otp);

      return res.json({ 
        success: true, 
        message: 'OTP sent to WhatsApp',
        expiresIn: OTP_EXPIRY_MINUTES,
        loginMethod: 'whatsapp'
      });
    }

    // Handle Telegram registration - UPDATED SECTION
    if (loginMethod === 'telegram') {
      if (!telegramChatId) {
        return res.status(400).json({ error: 'Telegram chat ID is required' });
      }

      // Demo mode for Telegram
      if (telegramChatId === DEMO_TELEGRAM_ID) {
        console.log('📱 Telegram Demo mode activated - Using test OTP');
        const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        
        const query = `
          INSERT INTO users (telegram_chat_id, otp, otp_expires_at, login_method)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (telegram_chat_id) 
          DO UPDATE SET otp = $2, otp_expires_at = $3, login_method = $4
          RETURNING id
        `;
        
        await pool.query(query, [telegramChatId, DEMO_OTP, otpExpiresAt, 'telegram']);
        
        return res.json({ 
          success: true, 
          message: 'Demo OTP ready: Use 000000',
          expiresIn: OTP_EXPIRY_MINUTES,
          demo: true,
          loginMethod: 'telegram'
        });
      }

      // Production Telegram mode - Generate OTP first
      const otp = generateTelegramOTP();
      const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      try {
        // Try to send OTP directly - this will validate if bot can message the user
        const sendResult = await sendTelegramOTP(telegramChatId, otp);
        
        // If sending succeeded, save to database
        const query = `
          INSERT INTO users (telegram_chat_id, otp, otp_expires_at, login_method, telegram_username)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (telegram_chat_id) 
          DO UPDATE SET otp = $2, otp_expires_at = $3, login_method = $4, telegram_username = $5
          RETURNING id
        `;

        // Extract username from chat info if available
        const username = sendResult.chatInfo?.username || 
                        sendResult.chatInfo?.first_name || 
                        'User';

        await pool.query(query, [
          telegramChatId, 
          otp, 
          otpExpiresAt, 
          'telegram',
          username
        ]);

        return res.json({ 
          success: true, 
          message: 'OTP sent to Telegram',
          expiresIn: OTP_EXPIRY_MINUTES,
          loginMethod: 'telegram'
        });
        
      } catch (sendError) {
        // If OTP send failed, return specific error message
        console.error('Failed to send Telegram OTP:', sendError.message);
        return res.status(400).json({ 
          error: sendError.message || 'Failed to send OTP to Telegram'
        });
      }
    }

  } catch (error) {
    console.error('Register error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Database service unavailable. Please try again later.' });
    }
    
    if (error.message.includes('Twilio') || error.message.includes('Telegram') || error.message.includes('OTP')) {
      return res.status(500).json({ error: 'Failed to send OTP. Please check service configuration.' });
    }
    
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /api/auth/verify-otp - Verify OTP and login
router.post('/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, telegramChatId, otp, loginMethod } = req.body;

    if (!otp) {
      return res.status(400).json({ error: 'OTP is required' });
    }

    if (!loginMethod || !['whatsapp', 'telegram'].includes(loginMethod)) {
      return res.status(400).json({ error: 'Invalid login method' });
    }

    let query, queryParams, identifier;

    if (loginMethod === 'whatsapp') {
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required for WhatsApp login' });
      }
      query = `SELECT id, otp, otp_expires_at, login_method FROM users WHERE phone_number = $1`;
      queryParams = [phoneNumber];
      identifier = phoneNumber;
    } else {
      if (!telegramChatId) {
        return res.status(400).json({ error: 'Telegram chat ID is required for Telegram login' });
      }
      query = `SELECT id, otp, otp_expires_at, login_method FROM users WHERE telegram_chat_id = $1`;
      queryParams = [telegramChatId];
      identifier = telegramChatId;
    }

    const { rows } = await pool.query(query, queryParams);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];

    if (user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    // Update user as verified
    const updateQuery = loginMethod === 'whatsapp'
      ? 'UPDATE users SET is_verified = TRUE, last_login = NOW(), otp = NULL WHERE id = $1'
      : 'UPDATE users SET is_verified = TRUE, last_login = NOW(), otp = NULL WHERE id = $1';

    await pool.query(updateQuery, [user.id]);

    const token = generateToken(user.id, identifier);

    res.json({
      success: true,
      access_token: token,
      user: { 
        id: user.id, 
        identifier: loginMethod === 'whatsapp' ? phoneNumber : telegramChatId,
        loginMethod: user.login_method
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Database service unavailable. Please try again later.' });
    }
    
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/resend-otp - Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { phoneNumber, telegramChatId, loginMethod } = req.body;

    if (!loginMethod || !['whatsapp', 'telegram'].includes(loginMethod)) {
      return res.status(400).json({ error: 'Invalid login method' });
    }

    if (loginMethod === 'whatsapp') {
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
      }

      const otp = generateTwilioOTP();
      const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await pool.query(
        'UPDATE users SET otp = $1, otp_expires_at = $2 WHERE phone_number = $3',
        [otp, otpExpiresAt, phoneNumber]
      );

      await sendWhatsAppOTP(phoneNumber, otp);

      return res.json({ 
        success: true, 
        message: 'OTP resent to WhatsApp',
        expiresIn: OTP_EXPIRY_MINUTES 
      });
    }

    if (loginMethod === 'telegram') {
      if (!telegramChatId) {
        return res.status(400).json({ error: 'Telegram chat ID required' });
      }

      const otp = generateTelegramOTP();
      const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await pool.query(
        'UPDATE users SET otp = $1, otp_expires_at = $2 WHERE telegram_chat_id = $3',
        [otp, otpExpiresAt, telegramChatId]
      );

      await sendTelegramOTP(telegramChatId, otp);

      return res.json({ 
        success: true, 
        message: 'OTP resent to Telegram',
        expiresIn: OTP_EXPIRY_MINUTES 
      });
    }
  } catch (error) {
    console.error('Resend OTP error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Database service unavailable. Please try again later.' });
    }
    
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

module.exports = router;