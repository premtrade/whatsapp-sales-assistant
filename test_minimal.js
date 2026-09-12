console.log("1");
try {
  const pdfParse = require("pdf-parse/dist/pdf-parse/cjs/index.cjs");
  console.log("2. pdf-parse loaded:", typeof pdfParse);
} catch (e) {
  console.log("2. pdf-parse failed:", e.message);
}
