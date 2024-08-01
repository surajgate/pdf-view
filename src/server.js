const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = 5000;

app.use(cors());

app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    res.set("Content-Type", "application/pdf");
    res.send(response.data);
  } catch (error) {
    res.status(500).send("Error fetching PDF");
  }
});

app.get("/pdf", async (req, res) => {
  // Specify the path to the PDF file
  const pdfFilePath = path.join(
    "C:",
    "Users",
    "Suraj Gate",
    "Desktop",
    "NLPRFPVol2.pdf"
  );

  // Check if the file exists
  if (fs.existsSync(pdfFilePath)) {
    // Set the content type to application/pdf
    res.setHeader("Content-Type", "application/pdf");

    // Create a read stream and pipe it to the response
    const readStream = fs.createReadStream(pdfFilePath);
    readStream.pipe(res);

    // Handle any errors
    readStream.on("error", (err) => {
      console.error("Error reading the PDF file:", err);
      res.status(500).send("Internal Server Error");
    });
  } else {
    res.status(404).send("File not found");
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});
