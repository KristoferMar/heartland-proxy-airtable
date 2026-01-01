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
    
    console.log("[frisbii-webhook] Received event:", payload.event_type);
    console.log("[frisbii-webhook] Payload:", JSON.stringify(payload, null, 2));

    // Handle different webhook event types
    const eventType = payload.event_type;
    
    // We're interested in subscription events
    if (eventType === "subscription_created" || 
        eventType === "invoice_authorized" || 
        eventType === "invoice_settled") {
      
      const subscription = payload.subscription;
      const customer = payload.customer;
      const invoice = payload.invoice;
      
      if (!subscription || !subscription.handle) {
        console.error("[frisbii-webhook] No subscription handle in payload");
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Missing subscription handle" })
        };
      }

      const sessionId = subscription.handle;
      console.log("[frisbii-webhook] Looking up session:", sessionId);

      // Find the donation session in Airtable
      const records = await base("donationsessions")
        .select({
          filterByFormula: `{sessionId} = '${sessionId}'`,
          maxRecords: 1
        })
        .firstPage();

      if (records.length === 0) {
        console.error("[frisbii-webhook] Session not found:", sessionId);
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Session not found" })
        };
      }

      const record = records[0];
      console.log("[frisbii-webhook] Found record:", record.id);

      // Prepare update data
      const updateData = {
        status: "active",
        activatedAt: new Date().toISOString()
      };

      // Add customer email if available
      if (customer && customer.email) {
        updateData.customerEmail = customer.email;
      }

      // Add Frisbii subscription ID if available
      if (subscription.id) {
        updateData.frisbiiSubscriptionHandle = subscription.id;
      }

      // Update the record
      await base("donationsessions").update(record.id, updateData);
      
      console.log("[frisbii-webhook] Updated record:", record.id, updateData);
      console.log("[frisbii-webhook] Donation for forening:", record.fields.foreningNavn);

      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true,
          message: "Webhook processed successfully",
          sessionId: sessionId,
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
    console.error("[frisbii-webhook] Error:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Internal server error",
        message: error.message 
      })
    };
  }
};
