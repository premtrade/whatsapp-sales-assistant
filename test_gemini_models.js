const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY not set');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

(async () => {
  const models = ['text-embedding-004', 'text-embedding-003', 'embedding-001'];
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
