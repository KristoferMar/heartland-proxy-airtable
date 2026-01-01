# Frisbii Webhook Setup

## Overview

This webhook receives notifications from Frisbii when subscription events occur (payment completed, subscription activated, etc.). It automatically updates the donation session records in Airtable.

## Webhook URL

Once deployed to Netlify, your webhook URL will be:

```
https://mellifluous-bombolone-bd1cac.netlify.app/.netlify/functions/frisbii-webhook
```

## Configure in Frisbii Admin Panel

1. **Log in to Frisbii admin panel**
   - Go to https://app.frisbii.com (or https://admin.reepay.com)

2. **Navigate to Webhooks**
   - Go to: **Developers** > **Webhooks**

3. **Create New Webhook**
   - Click "Add webhook" or "New webhook"
   - **URL**: `https://mellifluous-bombolone-bd1cac.netlify.app/.netlify/functions/frisbii-webhook`
   - **State**: Active/Enabled

4. **Select Events**
   
   Subscribe to these events:
   - ✅ `subscription_created` - When a new subscription is created
   - ✅ `invoice_authorized` - When payment is authorized
   - ✅ `invoice_settled` - When payment is completed
   
   Optional (for monitoring):
   - `subscription_cancelled` - If you want to track cancellations
   - `subscription_on_hold` - If payment fails

5. **Save the webhook**

## What the Webhook Does

When Frisbii sends a webhook:

1. **Receives the event** with subscription and customer data
2. **Extracts the `subscription.handle`** (this is our `sessionId`)
3. **Looks up the record** in Airtable `donationsessions` table
4. **Updates the record** with:
   - `status` → "active"
   - `customerEmail` → customer's email from Frisbii
   - `frisbiiSubscriptionHandle` → Frisbii's subscription ID
   - `activatedAt` → current timestamp

## Example Webhook Payload

```json
{
  "event_type": "invoice_authorized",
  "subscription": {
    "handle": "di-1704067890-a1b2c3d4",
    "id": "sub_abc123",
    "state": "active",
    "plan": "hjerteholder-100"
  },
  "customer": {
    "handle": "cust_xyz789",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe"
  },
  "invoice": {
    "id": "inv_123456",
    "amount": 10000,
    "state": "authorized"
  }
}
```

## Testing the Webhook

### Test Locally (Development)

Use a tool like [ngrok](https://ngrok.com/) to expose your local server:

```bash
# Start ngrok
ngrok http 8888

# Use the ngrok URL in Frisbii
https://abc123.ngrok.io/.netlify/functions/frisbii-webhook
```

### Test with Mock Data

You can test the webhook handler with curl:

```bash
curl -X POST https://mellifluous-bombolone-bd1cac.netlify.app/.netlify/functions/frisbii-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "invoice_authorized",
    "subscription": {
      "handle": "di-1704067890-a1b2c3d4",
      "id": "sub_test123",
      "state": "active"
    },
    "customer": {
      "email": "test@example.com"
    }
  }'
```

## Verify It's Working

1. **Check Netlify Functions logs**
   - Go to: Netlify Dashboard > Functions > frisbii-webhook > Logs
   - You should see log entries when webhooks are received

2. **Check Airtable**
   - Open your `donationsessions` table
   - Look for records with `status` = "active"
   - Verify `customerEmail` and `frisbiiSubscriptionHandle` are populated

## Troubleshooting

### Webhook not firing
- Verify webhook is "Active" in Frisbii admin
- Check the URL is correct (no typos)
- Ensure events are selected

### Records not updating
- Check Netlify function logs for errors
- Verify `sessionId` matches between Airtable and webhook payload
- Check Airtable API key has write permissions

### Test payments
- Use Frisbii test mode first
- Test card: `4111 1111 1111 1111`
- Any future expiry date, any CVV

## Security (Future Enhancement)

For production, you should verify webhook signatures:

```javascript
// Add webhook signature verification
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return hash === signature;
}
```

Add to `.env`:
```
FRISBII_WEBHOOK_SECRET=your_webhook_secret_from_frisbii
```

Frisbii documentation: https://docs.frisbii.com/reference/intro_webhooks
