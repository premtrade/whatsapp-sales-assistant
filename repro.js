const express = require("express");
const multer = require("multer");
const app = express();

const upload = multer({ storage: multer.memoryStorage() });

app.post("/upload", upload.single("file"), (req, res) => {
  console.log("file?", !!req.file, "body keys:", Object.keys(req.body));
  res.json({ ok: true, fileName: req.file?.originalname });
});

app.listen(4001, () => console.log("listening 4001"));
