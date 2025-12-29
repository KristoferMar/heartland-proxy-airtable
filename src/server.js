// src/server.js
require("dotenv").config();
const express = require("express");
const app = express();
const Airtable = require("airtable");

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

app.get("/get-records", async (req, res) => {
  try {
    const records = [];
    await base(process.env.AIRTABLE_TABLE_NAME)
      .select({ maxRecords: 10 })
      .eachPage((partialRecords, fetchNextPage) => {
        partialRecords.forEach((record) => {
          records.push(record.fields);
        });
        fetchNextPage();
      });

    res.json({ data: records });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch Airtable records" });
  }
});

// Route: Get Foreninger (associations)
app.get("/get-foreninger", async (req, res) => {
  try {
    const records = [];
    await base("Forening")
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
      .eachPage((partialRecords, fetchNextPage) => {
        partialRecords.forEach((record) => {
          records.push(record.fields);
        });
        fetchNextPage();
      });

    res.json({ data: records });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch Forening records" });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
