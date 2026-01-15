const express = require('express');
const router = express.Router();
const { generateFinancialAnalysis } = require('../services/ai.service');

// POST /api/ai/analyze
router.post('/analyze', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    // Call Groq
    const analysis = await generateFinancialAnalysis(query);

    res.json({ 
      success: true, 
      analysis: analysis 
    });

  } catch (error) {
    console.error("Route Error:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;