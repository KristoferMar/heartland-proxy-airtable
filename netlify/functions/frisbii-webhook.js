// netlify/functions/frisbii-webhook.js
// Simplified webhook handler - just logs events
// Status updates are handled by poll-pending-donations cron job

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
    console.log("[frisbii-webhook] Timestamp:", payload.timestamp);
    
    // Log the event for debugging
    if (payload.subscription) {
      console.log("[frisbii-webhook] Subscription:", payload.subscription);
    }
    
    console.log("[frisbii-webhook] Note: Payment status verification handled by poll-pending-donations");
    
    // Return 200 immediately - we verify payments asynchronously via cron job
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        message: "Event logged. Payment verification handled by polling service.",
        eventType: payload.event_type
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
