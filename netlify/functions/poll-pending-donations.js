// netlify/functions/poll-pending-donations.js
// Scheduled function: Polls Frisbii API to confirm pending donations

const Airtable = require("airtable");

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

// Get Frisbii API credentials
const FRISBII_PRIVATE_KEY = process.env.FRISBII_PRIVATE_KEY;
// Basic auth: base64 encode "private_key:" (with colon, no password)
const authHeader = `Basic ${Buffer.from(`${FRISBII_PRIVATE_KEY}:`).toString('base64')}`;

exports.handler = async (event, context) => {
  // Verify this is a scheduled invocation
  if (event.headers && event.headers["x-netlify-trigger"]) {
    console.log("[poll-pending-donations] Triggered by:", event.headers["x-netlify-trigger"]);
  }
  
  console.log("[poll-pending-donations] ========== POLLING STARTED ==========");
  console.log("[poll-pending-donations] Time:", new Date().toISOString());
  
  try {
    // Find all pending donations
    const pendingRecords = await base("donationsessions")
      .select({
        filterByFormula: "{status} = 'pending'",
        maxRecords: 100
      })
      .all();
    
    console.log(`[poll-pending-donations] Found ${pendingRecords.length} pending donations`);
    
    if (pendingRecords.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "No pending donations to check",
          checked: 0,
          updated: 0
        })
      };
    }
    
    let updatedCount = 0;
    const updates = [];
    
    // Check each pending donation
    for (const record of pendingRecords) {
      const sessionId = record.fields.sessionId;
      const foreningNavn = record.fields.foreningNavn;
      
      console.log(`[poll-pending-donations] Checking: ${sessionId} (${foreningNavn})`);
      
      try {
        // Query Frisbii API to get subscription details by handle (path parameter)
        const subscriptionResponse = await fetch(
          `https://api.frisbii.com/v1/subscription/${sessionId}`,
          {
            method: "GET",
            headers: {
              "Authorization": authHeader,
              "Content-Type": "application/json",
              "Accept": "application/json"
            }
          }
        );
        
        if (!subscriptionResponse.ok) {
          const errorBody = await subscriptionResponse.text();
          console.error(`[poll-pending-donations] ❌ Failed to fetch subscription ${sessionId}:`, subscriptionResponse.status, errorBody);
          continue;
        }
        
        const subscriptionData = await subscriptionResponse.json();
        const subscription = subscriptionData;
        console.log(`[poll-pending-donations] Subscription state: ${subscription.state || 'unknown'}`);
        
        // Frisbii confirmed: state="active" definitively means payment was collected
        let paymentConfirmed = false;
        
        if (subscription.state === "active") {
          paymentConfirmed = true;
          console.log(`[poll-pending-donations] ✅ Payment confirmed! Subscription is active`);
        } else {
          console.log(`[poll-pending-donations] ⏳ Waiting for activation. Current state: ${subscription.state}`);
        }
        
        // Update Airtable if payment is confirmed
        if (paymentConfirmed) {
          const updateData = {
            status: "active",
            activatedAt: new Date().toISOString(),
            frisbiiSubscriptionHandle: sessionId
          };
          
          await base("donationsessions").update(record.id, updateData);
          
          console.log(`[poll-pending-donations] ✅ Updated ${record.id} to 'active'`);
          console.log(`[poll-pending-donations]    Subscription: ${sessionId} (${subscription.state})`);
          console.log(`[poll-pending-donations]    Forening: ${foreningNavn}`);
          
          updatedCount++;
          updates.push({
            recordId: record.id,
            sessionId: sessionId,
            subscriptionState: subscription.state,
            forening: foreningNavn
          });
        } else {
          console.log(`[poll-pending-donations] ⏳ No confirmed payment yet for ${sessionId}`);
        }
        
      } catch (err) {
        console.error(`[poll-pending-donations] ❌ Error checking ${sessionId}:`, err.message);
        // Continue with next record
      }
    }
    
    console.log(`[poll-pending-donations] ========== POLLING COMPLETE ==========`);
    console.log(`[poll-pending-donations] Checked: ${pendingRecords.length}, Updated: ${updatedCount}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Polling completed successfully",
        checked: pendingRecords.length,
        updated: updatedCount,
        updates: updates
      })
    };
    
  } catch (error) {
    console.error("[poll-pending-donations] ❌ FATAL ERROR:", error.message);
    console.error("[poll-pending-donations] Stack:", error.stack);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: "Polling failed",
        message: error.message
      })
    };
  }
};
