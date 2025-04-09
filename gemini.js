const { GoogleGenAI } = require("@google/genai");
const dotenv = require("dotenv");
const { retriveContext } = require("./elasticsearch");

dotenv.config();

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API,
});

const giveDetails = async (emails) => {
  try {
    const CATEGORIES = [
      "Interested",
      "Meeting Booked",
      "Not Interested",
      "Spam",
      "Out of Office",
    ];

    console.log("gemnai");

    const prompt = `
        Classify the following email into one of these categories: ${CATEGORIES.join(
          ", "
        )}.

    Subject: ${emails.subject}
    Body: ${emails.body}

    Respond with only the category name.
        `;
    console.log(prompt);
    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });
    console.log(result.text);
    return result.text;
  } catch (err) {
    console.log(err);
    return "Error";
  }
};

const embeddings = async (query) => {
  try {
    const embeddings = await genAI.models.embedContent({
      model: "text-embedding-004",
      contents: query,
      config: {
        outputDimensionality: 768,
      },
    });
    return embeddings.embeddings[0].values;
  } catch (err) {
    console.log(err);
  }
};

const suggetionPromt = async (contexts, query) => {
  try {
    const context = contexts
      .map((item) => `Past Email: ${item._source.query}`)
      .join("\n\n");

    const prompt = `
       You are an AI email assistant. Use the following past queries to craft a reply:
    ${context}
    
    new email recived: "${query}"
    
    Generate a helpful and professional reply.
        `;
    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });
    console.log(result.text);
    return result.text;
  } catch (err) {
    console.log(err);
    return await embeddings(query);
  }
};

module.exports = { giveDetails, embeddings, suggetionPromt };
