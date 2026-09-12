const fs = require("fs");
console.log("File exists:", fs.existsSync("/app/test_knowledge.txt"));
console.log("File size:", fs.statSync("/app/test_knowledge.txt").size);
