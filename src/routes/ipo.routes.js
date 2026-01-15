const express = require('express');
const router = express.Router();
const { getIPOsFromDB } = require('../services/ipo.service');

router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'current', 'upcoming', 'past'
    const data = await getIPOsFromDB(type);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load IPO data' });
  }
});

module.exports = router;