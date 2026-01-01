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
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
]);

app.use(express.json()); // Parse JSON bodies

// Workaround for serverless-http body parsing issues
app.use((req, res, next) => {
  // If body is a string (sometimes happens with serverless-http), parse it
  if (typeof req.body === 'string' && req.body) {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      console.log("[body-parser] Failed to parse string body:", e.message);
    }
  }
  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log("[CORS] Request from origin:", origin, "Method:", req.method, "Path:", req.path);
  
  if (origin && allowlist.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin"); 
  } else if (origin) {
    // For debugging - allow all origins temporarily or add missing ones
    console.log("[CORS] Origin not in allowlist:", origin);
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

// Route: Create donation session
router.post("/create-donation-session", async (req, res) => {
  try {
    console.log("[create-donation-session] Request body:", JSON.stringify(req.body));
    
    const { foreningId, foreningNavn, tierId, tierName, tierPrice, customer } = req.body || {};

    // Validate input - check for undefined/null explicitly (foreningId can be 0)
    const missingFields = [];
    if (foreningId === undefined || foreningId === null) missingFields.push("foreningId");
    if (!foreningNavn) missingFields.push("foreningNavn");
    if (!tierId) missingFields.push("tierId");
    if (tierPrice === undefined || tierPrice === null) missingFields.push("tierPrice");
    
    // Validate customer data
    if (!customer) {
      missingFields.push("customer");
    } else {
      if (!customer.email) missingFields.push("customer.email");
      if (!customer.firstName) missingFields.push("customer.firstName");
      if (!customer.lastName) missingFields.push("customer.lastName");
      if (!customer.phone) missingFields.push("customer.phone");
      if (!customer.address) missingFields.push("customer.address");
      if (!customer.city) missingFields.push("customer.city");
      if (!customer.postalCode) missingFields.push("customer.postalCode");
    }
    
    if (missingFields.length > 0) {
      console.log("[create-donation-session] Missing fields:", missingFields, "Body was:", req.body);
      return res.status(400).json({ 
        error: `Missing required fields: ${missingFields.join(", ")}` 
      });
    }

    // Generate unique session ID
    const sessionId = `di-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store in Airtable
    let airtableRecordId = null;
    let airtableError = null;
    
    try {
      const airtableData = {
        sessionId: sessionId,
        foreningId: Number(foreningId), // Number field in Airtable
        foreningNavn: foreningNavn,
        tierId: tierId, // Single select - must match an existing option
        tierPrice: Number(tierPrice), // Number field in Airtable
        status: "pending", // Single select - must match an existing option
        createdAt: new Date().toISOString(),
        // Customer data
        customerEmail: customer.email,
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        customerCity: customer.city,
        customerPostalCode: customer.postalCode,
        customerCountry: customer.country || "DK",
        customerCompanyName: customer.companyName || null,
        customerCvr: customer.cvr || null
      };
      console.log("[create-donation-session] Creating Airtable record with:", JSON.stringify(airtableData));
      
      const createdRecord = await base("donationsessions").create(airtableData);
      airtableRecordId = createdRecord.id;
      console.log("[create-donation-session] Created Airtable record:", airtableRecordId);
    } catch (err) {
      // Log the full error details
      airtableError = err.message || String(err);
      console.error("[create-donation-session] Airtable error:", airtableError);
      console.error("[create-donation-session] Airtable error stack:", err.stack);
    }

    // Create Frisbii checkout session with customer data
    let checkoutUrl = null;
    let frisbiiError = null;
    
    try {
      if (!process.env.FRISBII_PRIVATE_KEY) {
        throw new Error("FRISBII_PRIVATE_KEY not configured");
      }

      console.log("[create-donation-session] Creating Frisbii session for plan:", tierId);
      
      // Build create_customer object for Frisbii
      const createCustomer = {
        email: customer.email,
        first_name: customer.firstName,
        last_name: customer.lastName,
        phone: `+45${customer.phone}`, // Add Danish country code
        address: customer.address,
        city: customer.city,
        postal_code: customer.postalCode,
        country: "DK"
      };
      
      // Add optional company info if provided
      if (customer.companyName) {
        createCustomer.company = customer.companyName;
      }
      if (customer.cvr) {
        createCustomer.vat = customer.cvr;
      }
      
      // Frisbii subscription session with create_customer
      const frisbiiPayload = {
        subscription: sessionId,      // Our session ID becomes the subscription handle
        plan: tierId,                 // The plan to subscribe to
        create_customer: createCustomer,
        accept_url: process.env.ACCEPT_URL || "https://stotmedhjerte.dk/tak",
        cancel_url: process.env.CANCEL_URL || "https://stotmedhjerte.dk/stoetteabonnement"
      };
      
      console.log("[create-donation-session] Frisbii payload:", JSON.stringify(frisbiiPayload));

      const frisbiiResponse = await fetch("https://checkout-api.frisbii.com/v1/session/subscription", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(process.env.FRISBII_PRIVATE_KEY + ":").toString("base64")}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(frisbiiPayload)
      });

      const frisbiiData = await frisbiiResponse.json();
      console.log("[create-donation-session] Frisbii response:", JSON.stringify(frisbiiData));

      if (!frisbiiResponse.ok) {
        throw new Error(`Frisbii API error: ${frisbiiData.error || frisbiiData.message || JSON.stringify(frisbiiData)}`);
      }

      checkoutUrl = frisbiiData.url;
      console.log("[create-donation-session] ✅ Frisbii checkout URL:", checkoutUrl);
      
    } catch (err) {
      frisbiiError = err.message || String(err);
      console.error("[create-donation-session] Frisbii error:", frisbiiError);
      
      // Fallback to static URL if Frisbii API fails
      checkoutUrl = process.env.FRISBII_CHECKOUT_URL || 
        "https://checkout.reepay.com/#/signup/24731b682aacd08c1c82da39fcbaf41e/stotteabonnement-manedlig";
      console.log("[create-donation-session] Using fallback URL:", checkoutUrl);
    }

    res.json({ 
      success: true,
      sessionId: sessionId,
      checkoutUrl: checkoutUrl,
      airtableRecordId: airtableRecordId,
      airtableError: airtableError,
      frisbiiError: frisbiiError
    });

  } catch (err) {
    console.error("[create-donation-session] Error:", err);
    res.status(500).json({ error: "Failed to create donation session" });
  }
});


app.use("/.netlify/functions/airtable", router);

module.exports.handler = serverless(app, {
  request: (request, event, context) => {
    // Ensure body is properly passed through from Netlify event
    if (event.body && typeof event.body === 'string') {
      try {
        request.body = JSON.parse(event.body);
      } catch (e) {
        request.body = event.body;
      }
    } else if (event.body) {
      request.body = event.body;
    }
  }
});
