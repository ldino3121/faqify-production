# Razorpay Dual Payment System Setup Guide

## Overview
This implementation provides:
1. **Auto-renewal subscriptions** for Indian users (INR)
2. **One-time payments** for both Indian and international users (INR/USD)

## What You Need to Do

### 1. Update Plan IDs in Database

From your Razorpay dashboard screenshot, I can see you have 2 plans:
- **Pro Plan**: ₹199/month 
- **Business Plan**: ₹999/month

**You need to:**
1. Copy the actual Plan IDs from your Razorpay dashboard
2. Update the SQL file `UPDATE_RAZORPAY_PLAN_IDS.sql`
3. Run the SQL in your Supabase SQL editor

**Steps:**
1. Go to your Razorpay dashboard → Plans
2. Copy the Plan ID for Pro plan (starts with `plan_`)
3. Copy the Plan ID for Business plan (starts with `plan_`)
4. Replace the placeholder values in the SQL file:

```sql
-- Replace 'plan_XXXXXXXX' with your actual Pro Plan ID
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_YOUR_ACTUAL_PRO_PLAN_ID'
WHERE name = 'Pro';

-- Replace 'plan_YYYYYYYY' with your actual Business Plan ID  
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_YOUR_ACTUAL_BUSINESS_PLAN_ID'
WHERE name = 'Business';
```

### 2. Configure Webhook in Razorpay Dashboard

**Steps:**
1. Go to Razorpay Dashboard → Settings → Webhooks
2. Click "Add New Webhook"
3. Set URL: `https://your-project.supabase.co/functions/v1/razorpay-webhook`
4. Select these events:
   - `payment.captured`
   - `payment.failed`
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.cancelled`
   - `subscription.completed`
5. Set webhook secret (save this for environment variables)

### 3. Update Environment Variables

Add these to your Supabase project settings:

```bash
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_from_step_2
```

### 4. Deploy Updated Functions

Run these commands to deploy the updated edge functions:

```bash
# Deploy the updated functions
supabase functions deploy create-razorpay-order
supabase functions deploy create-razorpay-subscription  
supabase functions deploy razorpay-webhook
```

## How It Works

### For Indian Users (IN country code):
1. **Subscription Payment** (Auto-renewal)
   - Uses Razorpay subscription plans
   - Automatically renews monthly
   - FAQ usage resets each billing cycle
   - Webhook handles renewal events

### For International Users (Non-IN country code):
1. **One-time Payment** (30 days)
   - Creates Razorpay order for one-time payment
   - Plan expires after 30 days
   - User needs to manually renew

## Payment Flow

### Indian Users:
```
User clicks upgrade → Detects IN country → Creates subscription → Razorpay subscription checkout → Auto-renewal setup
```

### International Users:
```
User clicks upgrade → Detects non-IN country → Creates order → Razorpay payment checkout → 30-day access
```

## Testing

### Test Indian User Flow:
1. Set user country to 'IN' in browser dev tools
2. Try upgrading to Pro/Business plan
3. Should see subscription checkout
4. Payment should create auto-renewal subscription

### Test International User Flow:
1. Set user country to 'US' in browser dev tools  
2. Try upgrading to Pro/Business plan
3. Should see one-time payment checkout
4. Payment should give 30-day access

## Webhook Events Handled

1. **subscription.activated** - Activates user subscription
2. **subscription.charged** - Resets FAQ usage for new billing period
3. **subscription.cancelled** - Marks subscription as cancelled
4. **subscription.completed** - Downgrades user to Free plan
5. **payment.captured** - Confirms one-time payment
6. **payment.failed** - Handles failed payments

## Database Changes

The system adds:
- `razorpay_subscription_id` column to `user_subscriptions` table
- `razorpay_plan_id_inr` column to `subscription_plans` table
- Proper indexing for fast lookups

## Next Steps

1. **Update the Plan IDs** in the SQL file with your actual Razorpay Plan IDs
2. **Run the SQL** in Supabase SQL editor
3. **Configure webhook** in Razorpay dashboard
4. **Deploy functions** using Supabase CLI
5. **Test both flows** (Indian and International users)

## Support

The system automatically:
- Detects user location
- Chooses appropriate payment method
- Handles webhook events
- Manages subscription lifecycle
- Resets FAQ usage on renewal
- Downgrades expired subscriptions

Your users will get:
- **Indian users**: Auto-renewal subscriptions
- **International users**: One-time 30-day access
- **All users**: Seamless payment experience
