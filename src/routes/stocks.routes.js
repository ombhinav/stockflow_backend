const express = require('express');
const router = express.Router();
const { searchStocks } = require('../services/nse.service');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/stocks/search?q=reliance
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ stocks: [] });
    }

    const stocks = await searchStocks(q);
    res.json({ stocks });
  } catch (error) {
    console.error('Stock search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;