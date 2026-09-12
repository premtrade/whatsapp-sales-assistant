const fs = require("fs");
const http = require("http");
const FormData = require("form-data");

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwZGY4ZDU2NS1lZDJiLTQ5NzAtYWZkZS03OTgxZWY3NjVmNzYiLCJlbWFpbCI6ImFkbWluQGdhcmNvY29uc3RydWN0aW9uLmNvbSIsInJvbGUiOiJhZG1pbiIsImZpcnN0TmFtZSI6IkFkbWluIiwibGFzdE5hbWUiOiJVc2VyIiwiaWF0IjoxNzg4OTgwMDg1LCJleHAiOjE3ODkwNjY0ODV9.4UlbmtwbGOmcdz0sjRoIUvAAqzOMIow9xNg-SLYZbv4";

const form = new FormData();
form.append("file", Buffer.from(fs.readFileSync("/app/test_knowledge.txt")), { filename: "test_knowledge.txt", contentType: "text/plain" });
form.append("title", "Garco Services & Pricing");
form.append("document_type", "txt");
form.append("language", "en");
form.append("source", "manual upload");

const options = {
  hostname: "localhost",
  port: 4000,
  path: "/api/knowledge/upload",
  method: "POST",
  headers: {
    Authorization: "Bearer " + token,
    ...form.getHeaders(),
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
form.pipe(req);
