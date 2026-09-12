const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

(async () => {
  const models = ['gemini-embedding-001', 'gemini-embedding-2-preview', 'gemini-embedding-2'];
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.embedContent('test');
      console.log('OK', modelName, result.embedding.values.length);
    } catch (e) {
      console.log('FAIL', modelName, e.message);
    }
  }
})();
