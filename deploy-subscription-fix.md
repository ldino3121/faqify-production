# Deploy Subscription Fix

## Root Cause Identified

The subscription creation is failing because:

1. **Wrong Plan IDs**: The edge function was using hardcoded plan IDs (`plan_REN5cBATpXrR7S`, `plan_REN7eCMJQuFc8n`) that don't exist in your Razorpay account.

2. **Missing Plans**: The required subscription plans haven't been created in your Razorpay dashboard.

## Solution Steps

### Step 1: Install Supabase CLI (if not installed)
```bash
npm install -g supabase
```

### Step 2: Login to Supabase
```bash
supabase login
```

### Step 3: Deploy the Fixed Edge Function
```bash
supabase functions deploy create-razorpay-subscription
```

### Step 4: Create Razorpay Plans
You need to create the subscription plans in your Razorpay dashboard. You can either:

**Option A: Use the setup script (recommended)**
1. Set your Razorpay credentials:
   ```bash
   set RAZORPAY_KEY_ID=your_actual_key_id
   set RAZORPAY_KEY_SECRET=your_actual_secret
   ```
2. Run the setup script:
   ```bash
   node setup-razorpay-plans-fixed.js
   ```

**Option B: Create plans manually in Razorpay Dashboard**
Go to your Razorpay Dashboard → Subscriptions → Plans and create:

1. **Pro Plan (INR)**
   - Plan ID: `faqify_pro_monthly_inr`
   - Amount: ₹199 (19900 paise)
   - Period: Monthly
   - Currency: INR

2. **Business Plan (INR)**
   - Plan ID: `faqify_business_monthly_inr`
   - Amount: ₹999 (99900 paise)
   - Period: Monthly
   - Currency: INR

3. **Pro Plan (USD)**
   - Plan ID: `faqify_pro_monthly_usd`
   - Amount: $9 (900 cents)
   - Period: Monthly
   - Currency: USD

4. **Business Plan (USD)**
   - Plan ID: `faqify_business_monthly_usd`
   - Amount: $29 (2900 cents)
   - Period: Monthly
   - Currency: USD

## What Was Fixed

1. **Updated Plan ID Logic**: The edge function now uses the correct plan IDs based on currency:
   - Pro INR: `faqify_pro_monthly_inr`
   - Pro USD: `faqify_pro_monthly_usd`
   - Business INR: `faqify_business_monthly_inr`
   - Business USD: `faqify_business_monthly_usd`

2. **Enhanced Error Logging**: Added detailed logging to help debug any future issues.

3. **Currency-Based Plan Selection**: The function now correctly selects plans based on the target currency.

## Testing

After deployment, test the subscription creation:

1. Go to your FAQify dashboard
2. Try to upgrade to Pro or Business plan
3. Check the browser console and Supabase edge function logs for any errors

## Alternative Quick Fix

If you want to use your existing plan IDs instead, you can update the edge function to use your actual plan IDs from Razorpay dashboard. Check your Razorpay dashboard → Subscriptions → Plans to get the correct plan IDs.
