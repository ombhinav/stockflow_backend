const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { createRazorpayOrder, verifyRazorpaySignature } = require('../services/payment.service');

// 1. Create Order
router.post('/create-order', async (req, res) => {
  try {
    const { amount } = req.body;
    const order = await createRazorpayOrder(amount); // Call the service
    res.json(order);
  } catch (error) {
    console.error("Payment Service Error:", error.message);
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

// 2. Verify Payment
router.post('/verify', async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      userId, 
      planType 
    } = req.body;

    // Call the service to check signature
    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (isValid) {
      // Database logic remains here (or can move to a user.service.js)
      await pool.query(
        `UPDATE users 
         SET plan_type = $1, 
             last_payment_id = $2, 
             subscription_expires_at = NOW() + INTERVAL '1 month' 
         WHERE id = $3`,
        [planType, razorpay_payment_id, userId]
      );

      res.json({ success: true, message: "Payment Verified" });
    } else {
      res.status(400).json({ success: false, message: "Invalid Signature" });
    }
  } catch (error) {
    console.error("Verification Error:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;