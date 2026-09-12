const https = require("https");

const options = {
  hostname: "generativelanguage.googleapis.com",
  path: "/v1beta/models?key=" + process.env.GEMINI_API_KEY,
  method: "GET",
};

const req = https.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => {
    const matches = body.match(/models\/[^"]*embed[^"]*/g) || [];
    console.log(matches.slice(0, 20));
    console.log("full len", body.length);
  });
});

req.on("error", (e) => console.error(e.message));
req.end();
