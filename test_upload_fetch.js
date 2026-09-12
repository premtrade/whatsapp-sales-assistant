const fs = require("fs");

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwZGY4ZDU2NS1lZDJiLTQ5NzAtYWZkZS03OTgxZWY3NjVmNzYiLCJlbWFpbCI6ImFkbWluQGdhcmNvY29uc3RydWN0aW9uLmNvbSIsInJvbGUiOiJhZG1pbiIsImZpcnN0TmFtZSI6IkFkbWluIiwibGFzdE5hbWUiOiJVc2VyIiwiaWF0IjoxNzg4OTgwMDg1LCJleHAiOjE3ODkwNjY0ODV9.4UlbmtwbGOmcdz0sjRoIUvAAqzOMIow9xNg-SLYZbv4";

(async () => {
  try {
    const form = new FormData();
    form.append("file", new File([fs.readFileSync("C:\\Projects\\whatsapp-sales-assistant\\test_knowledge.txt")], "test_knowledge.txt", { type: "text/plain" }));
    form.append("title", "Garco Services & Pricing");
    form.append("document_type", "txt");
    form.append("language", "en");
    form.append("source", "manual upload");

    const res = await fetch("http://localhost:4000/api/knowledge/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        ...form.getHeaders ? form.getHeaders() : {},
      },
      body: form,
    });

    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  } catch (e) {
    console.error("ERROR:", e.message);
  }
})();
