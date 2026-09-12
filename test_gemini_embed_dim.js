const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

(async () => {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent('test', { outputDimensionality: 768 });
  console.log('length', result.embedding.values.length);
  console.log('first5', result.embedding.values.slice(0, 5));
})();
