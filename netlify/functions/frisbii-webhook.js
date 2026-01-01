// netlify/functions/frisbii-webhook.js

const Airtable = require("airtable");

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async (event, context) => {
  // Only accept POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    // Parse webhook payload
    const payload = JSON.parse(event.body);
    
    console.log("[frisbii-webhook] ========== WEBHOOK RECEIVED ==========");
    console.log("[frisbii-webhook] Event type:", payload.event_type);
    console.log("[frisbii-webhook] Full payload:", JSON.stringify(payload, null, 2));

    // Handle different webhook event types
    const eventType = payload.event_type;
    
    // We're interested in subscription events
    if (eventType === "subscription_created" || 
        eventType === "invoice_authorized" || 
        eventType === "invoice_settled") {
      
      const subscription = payload.subscription || {};
      const customer = payload.customer || {};
      const invoice = payload.invoice || {};
      
      console.log("[frisbii-webhook] Subscription:", JSON.stringify(subscription));
      console.log("[frisbii-webhook] Customer:", JSON.stringify(customer));
      console.log("[frisbii-webhook] Customer email:", customer.email);

      // Try to find by subscription handle first (this should always work with dynamic sessions)
      let records = [];
      let matchMethod = null;
      const subscriptionHandle = subscription.handle;
      
      if (subscriptionHandle && subscriptionHandle.startsWith("di-")) {
        // Our session IDs start with "di-"
        console.log("[frisbii-webhook] Looking up by sessionId:", subscriptionHandle);
        records = await base("donationsessions")
          .select({
            filterByFormula: `{sessionId} = '${subscriptionHandle}'`,
            maxRecords: 1
          })
          .firstPage();
        matchMethod = "sessionId";
      }
      
      // Fallback: if not found by handle (shouldn't happen with proper setup)
      if (records.length === 0 && subscriptionHandle) {
        console.log("[frisbii-webhook] No match by di- handle, trying raw handle:", subscriptionHandle);
        records = await base("donationsessions")
          .select({
            filterByFormula: `{sessionId} = '${subscriptionHandle}'`,
            maxRecords: 1
          })
          .firstPage();
        matchMethod = "raw-handle";
      }

      if (records.length === 0) {
        console.log("[frisbii-webhook] No pending sessions found");
        // Still return 200 to prevent Frisbii from retrying
        return {
          statusCode: 200,
          body: JSON.stringify({ 
            success: false,
            message: "No pending session found to activate",
            eventType: eventType
          })
        };
      }

      const record = records[0];
      console.log("[frisbii-webhook] Found record:", record.id, "via", matchMethod);
      console.log("[frisbii-webhook] Record fields:", JSON.stringify(record.fields));

      // Prepare update data
      const updateData = {
        status: "active",
        activatedAt: new Date().toISOString()
      };

      // Add customer email if available
      if (customer.email) {
        updateData.customerEmail = customer.email;
      }

      // Add Frisbii subscription handle/id if available
      if (subscription.handle) {
        updateData.frisbiiSubscriptionHandle = subscription.handle;
      } else if (subscription.id) {
        updateData.frisbiiSubscriptionHandle = subscription.id;
      }

      // Update the record
      await base("donationsessions").update(record.id, updateData);
      
      console.log("[frisbii-webhook] ✅ Updated record:", record.id);
      console.log("[frisbii-webhook] Update data:", JSON.stringify(updateData));
      console.log("[frisbii-webhook] Donation for forening:", record.fields.foreningNavn);

      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true,
          message: "Webhook processed successfully",
          matchMethod: matchMethod,
          recordId: record.id,
          forening: record.fields.foreningNavn
        })
      };
    }

    // For other event types, just acknowledge receipt
    console.log("[frisbii-webhook] Unhandled event type:", eventType);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        message: "Event received but not processed",
        eventType: eventType
      })
    };

  } catch (error) {
    console.error("[frisbii-webhook] ❌ Error:", error.message);
    console.error("[frisbii-webhook] Stack:", error.stack);
    
    // Return 200 even on error to prevent Frisbii from retrying
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        error: "Internal server error",
        message: error.message 
      })
    };
  }
};
