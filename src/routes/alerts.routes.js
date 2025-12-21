const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/alerts - Get user's alert stocks
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT id, stock_symbol as symbol, stock_name as name, is_enabled, added_at
      FROM alert_stocks
      WHERE user_id = $1
      ORDER BY added_at DESC
    `;

    const { rows } = await pool.query(query, [userId]);
    res.json({ watchlist: rows });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// POST /api/alerts/add - Add stock to alerts
router.post('/add', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { symbol, name } = req.body;

    if (!symbol || !name) {
      return res.status(400).json({ error: 'Symbol and name required' });
    }

    const query = `
      INSERT INTO alert_stocks (user_id, stock_symbol, stock_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, stock_symbol) DO NOTHING
      RETURNING id
    `;

    const { rows } = await pool.query(query, [userId, symbol, name]);

    if (rows.length === 0) {
      return res.status(409).json({ error: 'Stock already in alerts' });
    }

    res.json({ 
      success: true, 
      message: 'Stock added to alerts',
      alertId: rows[0].id 
    });
  } catch (error) {
    console.error('Add alert error:', error);
    res.status(500).json({ error: 'Failed to add alert' });
  }
});

// DELETE /api/alerts/remove/:symbol - Remove stock from alerts
router.delete('/remove/:symbol', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { symbol } = req.params;

    const query = `
      DELETE FROM alert_stocks
      WHERE user_id = $1 AND stock_symbol = $2
      RETURNING id
    `;

    const { rows } = await pool.query(query, [userId, symbol]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ success: true, message: 'Alert removed' });
  } catch (error) {
    console.error('Remove alert error:', error);
    res.status(500).json({ error: 'Failed to remove alert' });
  }
});

// PUT /api/alerts/toggle/:symbol - Enable/disable alert
router.put('/toggle/:symbol', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { symbol } = req.params;
    const { enabled } = req.body;

    const query = `
      UPDATE alert_stocks
      SET is_enabled = $1
      WHERE user_id = $2 AND stock_symbol = $3
      RETURNING id
    `;

    const { rows } = await pool.query(query, [enabled, userId, symbol]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ 
      success: true, 
      message: `Alert ${enabled ? 'enabled' : 'disabled'}` 
    });
  } catch (error) {
    console.error('Toggle alert error:', error);
    res.status(500).json({ error: 'Failed to toggle alert' });
  }
});

// GET /api/alerts/history - Get alert history
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50 } = req.query;

    const query = `
      SELECT 
        id, stock_symbol, news_title, ai_summary, 
        whatsapp_sent, sent_at
      FROM alert_history
      WHERE user_id = $1
      ORDER BY sent_at DESC
      LIMIT $2
    `;

    const { rows } = await pool.query(query, [userId, limit]);
    res.json({ history: rows });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;