const http = require("http");

const options = {
  hostname: "localhost",
  port: 4000,
  path: "/health",
  method: "GET",
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
req.end();
