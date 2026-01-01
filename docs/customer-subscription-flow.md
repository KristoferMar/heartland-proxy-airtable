# Customer Subscription Flow - Implementation Plan

## Overview

This document describes the complete flow for creating donation subscriptions with customer info collection, Frisbii integration, and webhook handling.

## Flow Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. Select      │     │  2. Select      │     │  3. Customer    │     │  4. Frisbii     │
│  Forening       │ ──▶ │  Tier           │ ──▶ │  Info Form      │ ──▶ │  Payment        │
│  (list view)    │     │  (tier view)    │     │  (form view)    │     │  (external)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  Backend API    │
                                               │  - Airtable     │
                                               │  - Frisbii API  │
                                               └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  5. Webhook     │
                                               │  Updates status │
                                               │  to "active"    │
                                               └─────────────────┘
```

---

## Phase 1: Frontend - Customer Info Form

### 1.1 Create `CustomerForm.vue` component

**Location:** `src/components/CustomerForm.vue`

**Props:**
- `forening: Forening` - Selected association
- `tier: Tier` - Selected subscription tier

**Emits:**
- `back` - Go back to tier selection
- `submit` - Submit customer data

**Fields:**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| email | string | Yes | Valid email format |
| firstName | string | Yes | Min 2 characters |
| lastName | string | Yes | Min 2 characters |
| phone | string | No | Danish phone format |

**UI Elements:**
- Back button (← Tilbage)
- Summary card showing forening + tier + price
- Form fields with validation
- Submit button (Gå til betaling)
- Loading state during API call

**Status:** ⏳ Not started

---

### 1.2 Update `App.vue` view flow

**Current views:**
- `list` - Forening selection (Stotteabonnement.vue)
- `tier-selection` - Tier selection (TierSelection.vue)

**New views:**
- `list` - Forening selection
- `tier-selection` - Tier selection
- `customer-info` - Customer form ← NEW

**State to track:**
- `currentView: 'list' | 'tier-selection' | 'customer-info'`
- `selectedForening: Forening | null`
- `selectedTier: Tier | null` ← NEW

**Status:** ⏳ Not started

---

### 1.3 Update `TierSelection.vue`

**Changes:**
- Remove backend API call from `proceedToCheckout()`
- Change button text: "Fortsæt til betaling" → "Næste"
- Emit `select-tier` event with tier data
- Let App.vue handle navigation to customer-info

**Status:** ⏳ Not started

---

## Phase 2: Backend - Frisbii API with Customer

### 2.1 Update `/create-donation-session` endpoint

**Location:** `src/handler.js`

**New request body:**
```json
{
  "foreningId": 123,
  "foreningNavn": "Example Forening",
  "tierId": "hjerteholder-100-md-v2",
  "tierPrice": 100,
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+4512345678"
}
```

**Backend flow:**
1. Validate all required fields
2. Generate unique `sessionId`
3. Create Airtable record with customer email
4. Call Frisbii API with:
   - `create_customer`: email, firstName, lastName
   - `plan`: tierId
   - `subscription_handle`: sessionId
5. Return Frisbii checkout URL

**Frisbii API payload:**
```json
{
  "create_customer": {
    "handle": "cust-di-1234567890-abc123",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe"
  },
  "plan": "hjerteholder-100-md-v2",
  "subscription_handle": "di-1234567890-abc123",
  "accept_url": "https://stotmedhjerte.dk/tak",
  "cancel_url": "https://stotmedhjerte.dk/stoetteabonnement"
}
```

**Status:** ⏳ Not started

---

### 2.2 Update Airtable record structure

**New fields to store:**
- `customerEmail` - Already exists
- `customerFirstName` - Add if needed
- `customerLastName` - Add if needed

**Status:** ⏳ Not started

---

## Phase 3: Webhook Handling

### 3.1 Webhook endpoint (already implemented)

**Location:** `netlify/functions/frisbii-webhook.js`

**Matching logic:**
- Webhook receives `subscription.handle`
- Matches to Airtable `sessionId`
- Updates status to "active"
- Stores `activatedAt` timestamp

**Status:** ✅ Already implemented

---

## Implementation Checklist

### Phase 1: Frontend
- [ ] 1.1 Create CustomerForm.vue component
- [ ] 1.2 Update App.vue with new view flow
- [ ] 1.3 Update TierSelection.vue to emit event instead of API call
- [ ] 1.4 Build and test locally
- [ ] 1.5 Deploy to Shopify

### Phase 2: Backend
- [ ] 2.1 Update /create-donation-session with customer fields
- [ ] 2.2 Implement Frisbii API call with create_customer
- [ ] 2.3 Test API endpoint
- [ ] 2.4 Deploy to Netlify

### Phase 3: Testing
- [ ] 3.1 End-to-end test: Select forening → tier → enter info → pay
- [ ] 3.2 Verify Airtable record created with status "pending"
- [ ] 3.3 Complete test payment
- [ ] 3.4 Verify webhook updates status to "active"

---

## Environment Variables Required

**Netlify:**
- `AIRTABLE_API_KEY` ✅
- `AIRTABLE_BASE_ID` ✅
- `FRISBII_PRIVATE_KEY` ✅
- `ACCEPT_URL` (optional, defaults to https://stotmedhjerte.dk/tak)
- `CANCEL_URL` (optional, defaults to https://stotmedhjerte.dk/stoetteabonnement)

---

## Frisbii Plan Handles

| Tier Name | Price | Frisbii Plan Handle |
|-----------|-------|---------------------|
| Hjerteholder | 100 DKK/md | `hjerteholder-100-md-v2` |
| Hjerteambassadør | 200 DKK/md | `hjerteambassador-200-md-v2` |
| Hjertepartner | 300 DKK/md | `hjertepartner-300-md-v2` |
| Hjerteforkæmper | 500 DKK/md | `hjerteforkaemper-500-md-v2` |

---

## Airtable: donationsessions Table

| Field | Type | Description |
|-------|------|-------------|
| sessionId | Single line text | Unique session identifier (primary) |
| foreningId | Number | ID of selected forening |
| foreningNavn | Single line text | Name of selected forening |
| tierId | Single select | Plan handle |
| tierPrice | Number | Monthly price in DKK |
| status | Single select | pending / active / failed / cancelled |
| customerEmail | Email | Customer's email |
| createdAt | Date | Session creation timestamp |
| activatedAt | Date | Subscription activation timestamp |
| frisbiiSubscriptionHandle | Single line text | Subscription handle from Frisbii |

---

*Last updated: January 1, 2026*
