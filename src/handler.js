// src/handler.js

const express = require("express");
const serverless = require("serverless-http");
const Airtable = require("airtable");

const app = express();
const router = express.Router();

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

// ✅ CORS med whitelist (prod + localhost)
const allowlist = new Set([
  "https://stotmedhjerte.dk",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowlist.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin"); 
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Route: Get Hjertesager records
router.get("/get-records", async (req, res) => {
  try {
    const airtableRecords = await base(process.env.AIRTABLE_TABLE_NAME)
      .select({ maxRecords: 10 })
      .all();

    const records = airtableRecords.map((r) => r.fields);
    res.json({ data: records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Airtable records" });
  }
});

// Route: Get Foreninger (associations)
router.get("/get-foreninger", async (req, res) => {
  try {
    const airtableRecords = await base("Forening")
      .select({
        maxRecords: 100,
        fields: [
          "Forening - By",
          "creditro_verified",
          "Forening - Logo",
          "Forening - Postnummer",
          "Foreningskategori",
          "Foreningsnavn",
          "Foreningstype",
          "Samarbejdsaftale underskrevet"
        ]
      })
      .all();

    const records = airtableRecords.map((r) => r.fields);
    res.json({ data: records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Forening records" });
  }
});


app.use("/.netlify/functions/airtable", router);

module.exports.handler = serverless(app);
