const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { generateOTP, sendWhatsAppOTP } = require('../services/twilio.service');
const { generateToken } = require('../utils/jwt.util');
const { OTP_EXPIRY_MINUTES } = require('../config/constants');

// Demo credentials for testing (no Twilio charges)
const DEMO_PHONE = '9999999999';
const DEMO_OTP = '000000';

// POST /api/auth/register - Send OTP
router.post('/register', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber || phoneNumber.length !== 10) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    // Demo mode: Use demo OTP without calling Twilio
    if (phoneNumber === DEMO_PHONE) {
      console.log('📱 Demo mode activated - Using test OTP');
      const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
      
      const query = `
        INSERT INTO users (phone_number, otp, otp_expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (phone_number) 
        DO UPDATE SET otp = $2, otp_expires_at = $3
        RETURNING id
      `;
      
      await pool.query(query, [phoneNumber, DEMO_OTP, otpExpiresAt]);
      
      return res.json({ 
        success: true, 
        message: 'Demo OTP ready: Use 000000',
        expiresIn: OTP_EXPIRY_MINUTES,
        demo: true
      });
    }

    // Production mode: Generate and send real OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Upsert user
    const query = `
      INSERT INTO users (phone_number, otp, otp_expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (phone_number) 
      DO UPDATE SET otp = $2, otp_expires_at = $3
      RETURNING id
    `;

    await pool.query(query, [phoneNumber, otp, otpExpiresAt]);

    // Send OTP via WhatsApp
    await sendWhatsAppOTP(phoneNumber, otp);

    res.json({ 
      success: true, 
      message: 'OTP sent to WhatsApp',
      expiresIn: OTP_EXPIRY_MINUTES 
    });
  } catch (error) {
    console.error('Register error:', error.message);
    
    // Handle DB connection errors
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Database service unavailable. Please try again later.' });
    }
    
    // Handle Twilio/OTP sending errors
    if (error.message.includes('Twilio') || error.message.includes('OTP')) {
      return res.status(500).json({ error: 'Failed to send OTP. Please check Twilio configuration.' });
    }
    
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /api/auth/verify-otp - Verify OTP and login
router.post('/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP required' });
    }

    const query = `
      SELECT id, otp, otp_expires_at 
      FROM users 
      WHERE phone_number = $1
    `;

    const { rows } = await pool.query(query, [phoneNumber]);

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
    await pool.query(
      'UPDATE users SET is_verified = TRUE, last_login = NOW(), otp = NULL WHERE id = $1',
      [user.id]
    );

    const token = generateToken(user.id, phoneNumber);

    res.json({
      success: true,
      access_token: token,
      user: { id: user.id, phoneNumber }
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
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      'UPDATE users SET otp = $1, otp_expires_at = $2 WHERE phone_number = $3',
      [otp, otpExpiresAt, phoneNumber]
    );

    await sendWhatsAppOTP(phoneNumber, otp);

    res.json({ 
      success: true, 
      message: 'OTP resent',
      expiresIn: OTP_EXPIRY_MINUTES 
    });
  } catch (error) {
    console.error('Resend OTP error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Database service unavailable. Please try again later.' });
    }
    
    if (error.message.includes('Twilio') || error.message.includes('OTP')) {
      return res.status(500).json({ error: 'Failed to resend OTP. Please check Twilio configuration.' });
    }
    
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

module.exports = router;