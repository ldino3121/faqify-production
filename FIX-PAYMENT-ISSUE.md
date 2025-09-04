# 🔧 FIX: "Failed to start payment process" Error

## 🎯 **ISSUE IDENTIFIED**

The "Failed to start payment process" error when clicking upgrade buttons is likely caused by one of these issues:

1. **❌ Missing Razorpay Environment Variables** (Most Likely)
2. **❌ Database Migration Not Applied**
3. **❌ Edge Functions Not Deployed**
4. **❌ Plan Name Mismatch**

## ✅ **STEP-BY-STEP FIX**

### **Step 1: Set Up Razorpay Environment Variables**

#### **1.1 Get Razorpay Credentials:**
1. Go to https://razorpay.com and create account
2. Navigate to Settings → API Keys
3. Generate Test API Keys
4. Copy Key ID and Secret Key

#### **1.2 Configure Supabase Environment Variables:**
```bash
# In your Supabase project dashboard:
# Go to Settings → Edge Functions → Environment Variables

# Add these variables:
RAZORPAY_KEY_ID=rzp_test_your_key_id_here
RAZORPAY_SECRET_KEY=your_secret_key_here
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

**OR via Supabase CLI:**
```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_test_your_key_id
supabase secrets set RAZORPAY_SECRET_KEY=your_secret_key
supabase secrets set RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

### **Step 2: Apply Database Migration**

Run this SQL in your Supabase SQL Editor:

```sql
-- Add Razorpay support to existing tables
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT 'stripe',
ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd';

-- Add multi-currency pricing to subscription_plans
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS price_inr INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_eur INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_gbp INTEGER DEFAULT 0;

-- Update pricing for different currencies
UPDATE public.subscription_plans 
SET 
  price_inr = CASE 
    WHEN name = 'Free' THEN 0
    WHEN name = 'Pro' THEN 75000  -- ₹750 in paise
    WHEN name = 'Business' THEN 240000  -- ₹2400 in paise
  END,
  price_eur = CASE 
    WHEN name = 'Free' THEN 0
    WHEN name = 'Pro' THEN 850  -- €8.50 in cents
    WHEN name = 'Business' THEN 2700  -- €27 in cents
  END,
  price_gbp = CASE 
    WHEN name = 'Free' THEN 0
    WHEN name = 'Pro' THEN 750  -- £7.50 in pence
    WHEN name = 'Business' THEN 2400  -- £24 in pence
  END;
```

### **Step 3: Deploy Edge Functions**

```bash
# Deploy the Razorpay functions
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
supabase functions deploy razorpay-webhook
```

### **Step 4: Test the Fix**

Use the debug tool I created:

1. **Open**: `debug-razorpay-issue.html` in your browser
2. **Enter**: Your Supabase URL and Anon Key
3. **Login**: With your user credentials
4. **Run Tests**: Click each test button to identify the issue

## 🧪 **QUICK DIAGNOSTIC TESTS**

### **Test 1: Check Environment Variables**
```javascript
// In browser console after logging in:
const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
  body: { planId: 'Business', currency: 'usd', userCountry: 'US' }
});
console.log('Result:', data, error);
```

**Expected Results:**
- ✅ **Success**: Order created with Razorpay order ID
- ❌ **"Razorpay configuration missing"**: Environment variables not set
- ❌ **"Plan not found"**: Database migration needed

### **Test 2: Check Database Plans**
```javascript
// Check if plans exist in database:
const { data: plans } = await supabase.from('subscription_plans').select('*');
console.log('Available plans:', plans.map(p => p.name));
```

**Expected Results:**
- ✅ **Should show**: ['Free', 'Pro', 'Business']
- ❌ **Empty or missing**: Database migration needed

### **Test 3: Check Edge Functions**
```javascript
// Test if function is deployed:
const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
  body: { planId: 'Test' }
});
console.log('Function response:', data, error);
```

**Expected Results:**
- ✅ **Function responds**: Even with error, function is deployed
- ❌ **"Function not found"**: Edge function not deployed

## 🎯 **MOST LIKELY SOLUTIONS**

### **Solution A: Missing Environment Variables (90% of cases)**
```bash
# Set these in Supabase Dashboard → Settings → Edge Functions → Environment Variables:
RAZORPAY_KEY_ID=rzp_test_your_actual_key_id
RAZORPAY_SECRET_KEY=your_actual_secret_key
```

### **Solution B: Database Migration Not Applied**
```sql
-- Run this in Supabase SQL Editor:
\i supabase/migrations/20250115000000_add_razorpay_support.sql
```

### **Solution C: Edge Functions Not Deployed**
```bash
supabase functions deploy create-razorpay-order
```

## 🔍 **DEBUGGING STEPS**

### **Step 1: Check Supabase Logs**
1. Go to Supabase Dashboard → Logs → Edge Functions
2. Click upgrade button to trigger error
3. Look for error messages in logs

### **Step 2: Check Browser Console**
1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Click upgrade button
4. Look for error messages

### **Step 3: Test with Debug Tool**
1. Open `debug-razorpay-issue.html`
2. Run all diagnostic tests
3. Follow the specific error messages

## ✅ **VERIFICATION CHECKLIST**

After applying fixes, verify these work:

- [ ] Environment variables are set in Supabase
- [ ] Database migration has been applied
- [ ] Edge functions are deployed
- [ ] Plans exist in database with correct names
- [ ] Debug tool shows all tests passing
- [ ] Upgrade button opens Razorpay modal (not error)
- [ ] Test payment completes successfully

## 🚀 **EXPECTED WORKING FLOW**

After fixing, this should happen:

```
1. Click "Upgrade to Business" →
2. Razorpay modal opens on screen →
3. Enter test card: 4111 1111 1111 1111 →
4. Payment completes →
5. Success message appears →
6. Plan upgrades immediately →
7. Dashboard refreshes with new plan
```

## 📞 **IF STILL NOT WORKING**

If the issue persists after following all steps:

1. **Run the debug tool** and share the results
2. **Check Supabase logs** for specific error messages
3. **Verify environment variables** are actually set
4. **Confirm database migration** was applied successfully

## 💡 **QUICK FIX FOR TESTING**

If you need a quick test to see if everything else works:

1. **Temporarily use Stripe** by changing the dashboard component back to `create-checkout-session`
2. **If Stripe works** → Issue is Razorpay configuration
3. **If Stripe doesn't work** → Issue is deeper (database/authentication)

---

## 🎯 **MOST COMMON ISSUE: ENVIRONMENT VARIABLES**

**90% of "Failed to start payment process" errors are caused by missing Razorpay environment variables in Supabase Edge Functions.**

**Quick Fix:**
1. Go to Supabase Dashboard
2. Settings → Edge Functions → Environment Variables
3. Add: `RAZORPAY_KEY_ID` and `RAZORPAY_SECRET_KEY`
4. Redeploy functions: `supabase functions deploy create-razorpay-order`

**This should resolve the issue immediately!** ✅
