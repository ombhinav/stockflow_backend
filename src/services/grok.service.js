const Groq = require("groq-sdk");

let groqClient = null;

/**
 * Initialize Groq client once (singleton)
 */
const getGroqClient = () => {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY environment variable is required");
    }

    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  return groqClient;
};

/**
 * Smart model selection based on content size
 * Keeps free-tier usage optimized
 */
const chooseModel = (newsContent) => {
  const length = newsContent?.length || 0;

  if (length < 800) return "llama-3.3-70b-versatile";          // cheap + fast
  if (length < 2500) return "llama-3.3-70b-versatile";     // better reasoning
  return "llama-3.3-70b-versatile";                           // heavy only if needed
};

/**
 * Summarize corporate news
 */
const summarizeNews = async (newsContent, stockSymbol, stockName) => {
  try {
    const groq = getGroqClient();
    const model = chooseModel(newsContent);

    const prompt = `
You are a financial analyst. Summarize this corporate announcement for a retail investor.

Company: ${stockName}
Announcement: ${newsContent}

Output requirements:
- Short bullet points.
- Extract all important details.
- Fetch the numbers if present.
`;

    const completion = await groq.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,       // deterministic → better caching later
      max_tokens: 120,        // cost control
    });

    const summary =
      completion?.choices?.[0]?.message?.content?.trim();

    if (!summary || typeof summary !== "string") {
      throw new Error("Groq returned empty or invalid summary");
    }

    console.log(`✅ Groq summary generated for ${stockSymbol} using ${model}`);
    return summary;

  } catch (error) {
    console.error("❌ Groq AI error:", error.message);

    // Fallback summary (same behavior as Gemini)
    return `New announcement for ${stockName} (${stockSymbol}). Check the latest update on NSE.`;
  }
};

module.exports = { summarizeNews };
