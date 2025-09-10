# 🚀 RAZORPAY NATIVE SUBSCRIPTION SYSTEM - COMPLETE SETUP GUIDE

## ✅ **WHAT'S BEEN IMPLEMENTED**

### **🎯 Native Razorpay Subscription Features:**
- **✅ Automatic Billing Cycles** (monthly recurring)
- **✅ Plan Management** (Pro ₹199/month, Business ₹999/month)
- **✅ Subscription Controls** (Pause/Resume/Cancel)
- **✅ Real-time Status Updates** via webhooks
- **✅ Location-based Pricing** (India vs International)
- **✅ Professional Subscription Management**

---

## 🔧 **STEP 1: RUN SQL MIGRATION**

**Go to Supabase Dashboard → SQL Editor and run these queries:**

```sql
-- 1. Add subscription management columns
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time',
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS subscription_source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_plan_id TEXT;

-- 2. Add India pricing to subscription plans
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS price_inr INTEGER;

UPDATE public.subscription_plans 
SET price_inr = CASE 
  WHEN name = 'Pro' THEN 19900
  WHEN name = 'Business' THEN 99900
  ELSE NULL
END
WHERE name IN ('Pro', 'Business');

-- 3. Update Free plan FAQ limit
UPDATE public.subscription_plans 
SET faq_limit = 10
WHERE name = 'Free';

-- 4. Update existing users
UPDATE public.user_subscriptions 
SET 
  auto_renewal = CASE 
    WHEN plan_tier = 'Free' THEN false 
    ELSE true 
  END,
  payment_type = CASE 
    WHEN plan_tier = 'Free' THEN 'one_time'
    ELSE 'recurring'
  END,
  billing_cycle = 'monthly',
  subscription_source = 'manual'
WHERE auto_renewal IS NULL;

-- 5. Create payment transactions table
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  payment_gateway TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL,
  plan_tier TEXT NOT NULL,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Create subscription cancellations table
CREATE TABLE IF NOT EXISTS public.subscription_cancellations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancellation_reason TEXT,
  effective_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Set up security
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions" ON public.payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.payment_transactions TO authenticated;
```

---

## 🔧 **STEP 2: CREATE RAZORPAY SUBSCRIPTION PLANS**

### **Option A: Using Node.js Script (Recommended)**

```bash
# Set your Razorpay credentials
export RAZORPAY_KEY_ID="rzp_test_your_key_id"
export RAZORPAY_KEY_SECRET="your_razorpay_key_secret"

# Run the setup script
node setup-razorpay-plans.js
```

### **Option B: Using Supabase Edge Function**

```bash
# Deploy the setup function
supabase functions deploy setup-razorpay-plans

# Call the function (replace with your project URL)
curl -X POST 'https://your-project.supabase.co/functions/v1/setup-razorpay-plans' \
  -H 'Authorization: Bearer your-anon-key' \
  -H 'Content-Type: application/json'
```

### **Expected Plans Created:**
- `faqify_pro_monthly_inr` - ₹199/month
- `faqify_business_monthly_inr` - ₹999/month  
- `faqify_pro_monthly_usd` - $9/month
- `faqify_business_monthly_usd` - $29/month

---

## 🔧 **STEP 3: DEPLOY EDGE FUNCTIONS**

```bash
# Deploy all subscription-related functions
supabase functions deploy create-razorpay-subscription
supabase functions deploy manage-razorpay-subscription
supabase functions deploy razorpay-subscription-webhook
```

---

## 🔧 **STEP 4: SET ENVIRONMENT VARIABLES**

**In Supabase Dashboard → Settings → Edge Functions:**

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

---

## 🔧 **STEP 5: CONFIGURE WEBHOOKS**

**In Razorpay Dashboard → Settings → Webhooks:**

1. **Webhook URL**: `https://your-project.supabase.co/functions/v1/razorpay-subscription-webhook`
2. **Events to Subscribe**:
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.cancelled`
   - `subscription.paused`
   - `subscription.resumed`
   - `subscription.completed`

---

## 🎯 **HOW IT WORKS**

### **🔄 Subscription Flow:**
1. **User selects plan** → Frontend calls `create-razorpay-subscription`
2. **Razorpay subscription created** → User completes payment
3. **Webhook triggered** → Database updated automatically
4. **Recurring billing** → Razorpay handles automatically
5. **User management** → Pause/Resume/Cancel via dashboard

### **💰 Pricing Logic:**
- **India Users**: ₹199 Pro, ₹999 Business
- **International**: $9 Pro, $29 Business
- **Auto-detection** via IP geolocation
- **Manual override** for testing

### **🎛️ Subscription Management:**
- **Pause**: Subscription paused until manually resumed
- **Resume**: Reactivate paused subscription
- **Cancel**: Immediate or end-of-cycle cancellation
- **Status**: Real-time sync with Razorpay

---

## 🧪 **TESTING**

### **1. Test Plan Creation:**
```bash
node setup-razorpay-plans.js
# Should show: ✅ Created 4 plans
```

### **2. Test Subscription Creation:**
1. Go to Dashboard → Upgrade Plan
2. Click "🇮🇳 India" test button
3. Select Pro plan → Should show ₹199
4. Click "Upgrade to Pro" → Razorpay checkout opens

### **3. Test Subscription Management:**
1. After successful subscription
2. Go to Dashboard → Overview
3. See "Razorpay Subscription Management" section
4. Test Pause/Resume/Cancel buttons

---

## 🚀 **ADVANTAGES**

✅ **Professional**: Native Razorpay subscription system  
✅ **Automatic**: Handles billing, retries, dunning  
✅ **Compliant**: PCI DSS, security handled by Razorpay  
✅ **Flexible**: Pause/Resume/Cancel functionality  
✅ **Real-time**: Webhook-based status updates  
✅ **Global**: Multi-currency support (INR/USD)  
✅ **Scalable**: Production-ready architecture  

---

## 🎉 **RESULT**

**You now have a complete, production-ready subscription system powered by Razorpay's native subscription infrastructure!**

**Users can:**
- Subscribe with automatic recurring billing
- Manage subscriptions (pause/resume/cancel)
- See real-time subscription status
- Pay in local currency (₹ for India, $ for international)

**You get:**
- Professional subscription management
- Automatic billing and payment retries
- Real-time webhook updates
- Compliance and security handled by Razorpay
- Detailed subscription analytics
