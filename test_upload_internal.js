const fs = require("fs");
const http = require("http");

const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
const fileContent = fs.readFileSync("/app/test_knowledge.txt");

const parts = [
  "--" + boundary,
  'Content-Disposition: form-data; name="file"; filename="test_knowledge.txt"',
  "Content-Type: text/plain",
  "",
  fileContent,
  "--" + boundary,
  'Content-Disposition: form-data; name="title"',
  "",
  "Garco Services & Pricing",
  "--" + boundary,
  'Content-Disposition: form-data; name="document_type"',
  "",
  "txt",
  "--" + boundary,
  'Content-Disposition: form-data; name="language"',
  "",
  "en",
  "--" + boundary,
  'Content-Disposition: form-data; name="source"',
  "",
  "manual upload",
  "--" + boundary + "--",
  ""
].join("\r\n");

const body = Buffer.from(parts, "utf8");
const options = {
  hostname: "localhost",
  port: 4000,
  path: "/api/knowledge/upload",
  method: "POST",
  headers: {
    Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwZGY4ZDU2NS1lZDJiLTQ5NzAtYWZkZS03OTgxZWY3NjVmNzYiLCJlbWFpbCI6ImFkbWluQGdhcmNvY29uc3RydWN0aW9uLmNvbSIsInJvbGUiOiJhZG1pbiIsImZpcnN0TmFtZSI6IkFkbWluIiwibGFzdE5hbWUiOiJVc2VyIiwiaWF0IjoxNzg4OTgwMDg1LCJleHAiOjE3ODkwNjY0ODV9.4UlbmtwbGOmcdz0sjRoIUvAAqzOMIow9xNg-SLYZbv4",
    "Content-Type": "multipart/form-data; boundary=" + boundary,
    "Content-Length": String(body.length),
  },
};

const req = http.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Body:", data);
  });
});

req.on("error", (e) => console.error("Request error:", e.message));
req.write(body);
req.end();
