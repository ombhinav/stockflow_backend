const twilio = require('twilio');

let client = null;

const getTwilioClient = () => {
  if (!client) {
    // Validate credentials
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
    }
    
    // Validate account SID format
    if (!process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
      throw new Error('TWILIO_ACCOUNT_SID must start with AC');
    }

    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return client;
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendWhatsAppOTP = async (phoneNumber, otp) => {
  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:+91${phoneNumber}`,
      body: `Your StockFlow verification code is: ${otp}\n\nThis code expires in 10 minutes.`
    });
    
    console.log(`✅ OTP sent to ${phoneNumber}: ${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (error) {
    console.error('❌ Twilio OTP error:', error.message);
    throw new Error('Failed to send OTP');
  }
};

const sendWhatsAppAlert = async (phoneNumber, stockSymbol, summary) => {
  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:+91${phoneNumber}`,
      body: `🔔 *StockFlow Alert*\n\n*${stockSymbol}*\n\n${summary}\n\n_Powered by StockFlow_`
    });
    
    console.log(`✅ Alert sent to ${phoneNumber}: ${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (error) {
    console.error('❌ Twilio alert error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateOTP,
  sendWhatsAppOTP,
  sendWhatsAppAlert
};