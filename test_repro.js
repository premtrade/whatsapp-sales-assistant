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
  "--" + boundary + "--",
  ""
].join("\r\n");

const body = Buffer.from(parts, "utf8");
const options = {
  hostname: "localhost",
  port: 4001,
  path: "/upload",
  method: "POST",
  headers: {
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
