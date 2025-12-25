const express = require('express');
const router = express.Router();
const notificationService = require('../services/notification.service');

// ============================================
// POST /api/notifications/check - Check and send notifications
// ============================================

router.post('/check', async (req, res) => {
  try {
    console.log('[API] Notification check triggered');
    
    // Run notification check asynchronously
    notificationService.checkAndNotify().catch(error => {
      console.error('[ERROR] Async notification check failed:', error.message);
    });
    
    res.json({ success: true, message: 'Notification check started' });
  } catch (error) {
    console.error('[ERROR] Notification check error:', error.message);
    res.status(500).json({ error: 'Notification check failed' });
  }
});

module.exports = router;
