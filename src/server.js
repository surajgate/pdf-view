const express = require("express");
const cors = require("cors");
const axios = require("axios");

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

app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});
