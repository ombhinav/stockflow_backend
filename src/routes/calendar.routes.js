const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/events', async (req, res) => {
  try {
    const { start, end } = req.query;
    
    const result = await pool.query(
      `SELECT id, symbol, company_name, purpose, details, event_type, 
       TO_CHAR(event_date, 'YYYY-MM-DD') as date_str 
       FROM corporate_events 
       WHERE event_date >= $1::date AND event_date <= $2::date 
       ORDER BY event_date ASC`,
      [start, end]
    );

    const grouped = result.rows.reduce((acc, event) => {
      const dateKey = event.date_str; 
      if (!acc[dateKey]) acc[dateKey] = [];
      
      acc[dateKey].push({
        id: event.id,
        symbol: event.symbol,
        company_name: event.company_name,
        purpose: event.purpose,
        event_type: event.event_type, 
        event_date: event.date_str,
        details: event.details // Maps to bm_desc from API
      });
      return acc;
    }, {});

    res.json(grouped);
  } catch (error) {
    console.error("Calendar Route Error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;