const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

const getGeminiClient = () => {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
};

const summarizeNews = async (newsContent, stockSymbol, stockName) => {
  try {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are a financial analyst. Summarize this corporate announcement for a retail investor.
                Company: ${stockName}
                Announcement: ${newsContent}
                Output requirements:
                - exactly 3 short bullet points.
                - If it mentions numbers, highlight them.
                - Keep it under 50 words total.`;


    const result = await model.generateContent(prompt);
    
    if (!result || !result.response) {
      throw new Error('Invalid response from Gemini API');
    }

    const response = await result.response;
    const summary = response.text();

    if (!summary || typeof summary !== 'string') {
      throw new Error('Gemini returned empty or invalid summary');
    }

    console.log(`✅ Gemini summary generated for ${stockSymbol}`);
    return summary.trim();
  } catch (error) {
    console.error('❌ Gemini AI error:', error.message);
    // Fallback summary
    return `New announcement for ${stockName} (${stockSymbol}). Check the latest update on NSE.`;
  }
};

module.exports = { summarizeNews };