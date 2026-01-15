const Groq = require("groq-sdk");

let groqClient = null;

// 1. Singleton Client (Same as your existing code)
const getGroqClient = () => {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY environment variable is required");
    }
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
};

// 2. Financial Analyst Function
const generateFinancialAnalysis = async (userQuery) => {
  try {
    const groq = getGroqClient();
    
    // Using Llama-3.3-70b-versatile for high intelligence
    const model = "llama-3.3-70b-versatile"; 

    console.log(`🤖 Analyzing with Groq (${model}):`, userQuery);

    const completion = await groq.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are an expert Financial Analyst for "StockFloww".
          
          Guidelines:
          1. **Role**: Act as a senior market forensic specialist.
          2. **Data Usage**: If the user asks about specific live data (like "current price"), admit you don't have real-time access but analyze the *concept* or *historical context* instead.
          3. **Tone**: Professional, objective, and concise. Use bullet points for clarity.
          4. **Safety**: Always end with a short disclaimer: "Not financial advice."`
        },
        {
          role: "user",
          content: userQuery
        }
      ],
      temperature: 0.6, // Slight creativity for analysis, but grounded
      max_tokens: 800,  // Allow longer responses for deep analysis
    });

    const analysis = completion.choices[0]?.message?.content || "Analysis unavailable.";
    return analysis;

  } catch (error) {
    console.error("❌ Groq AI Error:", error.message);
    throw new Error("Failed to generate analysis. Please try again later.");
  }
};

module.exports = { generateFinancialAnalysis };