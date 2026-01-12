const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Creates an order in Razorpay system
 * @param {number} amount - Amount in INR
 */
const createRazorpayOrder = async (amount) => {
  try {
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };
    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    throw new Error(`Razorpay Error: ${error.message}`);
  }
};

/**
 * Verifies the signature returned by frontend
 */
const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(orderId + "|" + paymentId)
    .digest('hex');

  return generated_signature === signature;
};

module.exports = { createRazorpayOrder, verifyRazorpaySignature };