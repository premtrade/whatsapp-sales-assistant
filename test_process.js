const fs = require("fs");
const { processAndIndexDocument } = require("./dist/services/knowledge.service");

(async () => {
  try {
    const result = await processAndIndexDocument({
      title: "Garco Services & Pricing",
      documentType: "txt",
      fileBuffer: Buffer.from(fs.readFileSync("/app/test_knowledge.txt")),
      mimeType: "text/plain",
      originalFileName: "test_knowledge.txt",
      language: "en",
      source: "manual upload",
      businessId: "8b7b9872-7409-4258-be41-9f38737fec41",
      metadata: { uploadedBy: "test" },
    });
    console.log("SUCCESS");
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("ERROR:", e.message);
    console.error(e.stack);
  }
})();
