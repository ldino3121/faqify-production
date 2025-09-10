# 🏗️ COMPLETE PAYMENT ARCHITECTURE ANALYSIS

## 📋 **PAYMENT SYSTEM STRUCTURE**

Your FAQify app has **TWO PARALLEL PAYMENT SYSTEMS**:

### **🔄 SYSTEM 1: SUBSCRIPTION SYSTEM (Auto-Renewal)**
- **Edge Function**: `create-razorpay-subscription`
- **Purpose**: Creates Razorpay subscriptions with auto-renewal
- **Used By**: Dashboard upgrade buttons (when `paymentType === 'subscription'`)

### **💰 SYSTEM 2: ONE-TIME PAYMENT SYSTEM (Manual Renewal)**
- **Edge Function**: `create-razorpay-order`
- **Purpose**: Creates one-time Razorpay orders
- **Used By**: Landing page pricing buttons

---

## 🔍 **LINE-BY-LINE ANALYSIS**

### **📄 create-razorpay-subscription/index.ts (SUBSCRIPTION SYSTEM)**

**Lines 1-16**: Import dependencies and define interfaces
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface SubscriptionRequest {
  planId: 'Pro' | 'Business';
  userEmail: string;
  userName: string;
  currency?: 'INR' | 'USD';
  userCountry?: string;
}
```

**Lines 17-43**: Handle CORS and authenticate user
```typescript
serve(async (req) => {
  // CORS handling
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // User authentication via JWT
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    }
  )

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
  if (userError || !user) {
    throw new Error('Unauthorized')
  }
```

**Lines 44-61**: Parse request and validate credentials
```typescript
const { planId, userEmail, userName, currency, userCountry } = await req.json()

// Validate plan
if (!['Pro', 'Business'].includes(planId)) {
  throw new Error('Invalid plan selected')
}

// Get Razorpay credentials from environment
const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')
const razorpayKeySecret = Deno.env.get('RAZORPAY_SECRET_KEY')

if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error('Razorpay credentials not configured')
}
```

**Lines 62-89**: Fetch plan details from database
```typescript
// Create admin client for database access
const supabaseAdminClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Get plan from database
const { data: selectedPlan, error: planError } = await supabaseAdminClient
  .from('subscription_plans')
  .select('*')
  .eq('name', planId)
  .single();

if (planError || !selectedPlan) {
  throw new Error(`Plan not found: ${planId}`);
}

// Get Razorpay Plan ID from database
let razorpayPlanId = selectedPlan?.razorpay_plan_id_inr;
```

**Lines 90-109**: Fallback to hardcoded plan IDs
```typescript
// If no plan ID in database, use hardcoded values
if (!razorpayPlanId) {
  if (planId === 'Pro') {
    razorpayPlanId = 'plan_REN5cBATpXrR7S';  // YOUR ACTUAL PRO PLAN ID
  } else if (planId === 'Business') {
    razorpayPlanId = 'plan_RENZeCMJQuFc8n'; // YOUR ACTUAL BUSINESS PLAN ID
  }
}

if (!razorpayPlanId) {
  throw new Error(`No Razorpay Plan ID found for ${planId}`);
}
```

**Lines 110-141**: Create Razorpay subscription
```typescript
// Subscription configuration
const subscriptionData = {
  plan_id: razorpayPlanId,
  customer_notify: 1,
  quantity: 1,
  total_count: 0, // 🔑 KEY: 0 = unlimited (auto-renewal)
  start_at: Math.floor(Date.now() / 1000),
  notes: {
    user_id: user.id,
    payment_type: 'subscription' // 🔑 KEY: This marks it as subscription
  }
}

// Call Razorpay API
const authHeader = 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`)
const razorpayResponse = await fetch('https://api.razorpay.com/v1/subscriptions', {
  method: 'POST',
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(subscriptionData),
})
```

**Lines 142-186**: Handle response and store in database
```typescript
if (!razorpayResponse.ok) {
  const errorData = await razorpayResponse.text()
  throw new Error(`Failed to create subscription: ${errorData}`)
}

const razorpaySubscription = await razorpayResponse.json()

// Store in payment_transactions table
const { error: dbError } = await supabaseClient
  .from('payment_transactions')
  .insert({
    user_id: user.id,
    razorpay_order_id: razorpaySubscription.id, // 🔑 KEY: subscription_id stored here
    payment_type: 'subscription', // 🔑 KEY: Marked as subscription
    amount: currencyPlan.amount,
    currency: targetCurrency,
    status: 'created',
    plan_tier: planId,
    metadata: {
      subscription_id: razorpaySubscription.id,
      auto_renewal: true // 🔑 KEY: Auto-renewal enabled
    }
  })
```

**Lines 187-212**: Return subscription details
```typescript
return new Response(
  JSON.stringify({
    success: true,
    subscription_id: razorpaySubscription.id, // 🔑 KEY: Returns subscription_id
    plan_id: razorpayPlanId,
    amount: currencyPlan.amount,
    currency: targetCurrency,
    status: razorpaySubscription.status,
    short_url: razorpaySubscription.short_url, // Payment link
    billing_details: {
      billing_cycle: 'monthly',
      next_billing: new Date(razorpaySubscription.current_start * 1000).toISOString()
    }
  })
)
```

---

## 🎯 **KEY DIFFERENCES BETWEEN SYSTEMS**

### **🔄 SUBSCRIPTION SYSTEM**
- **API Endpoint**: `https://api.razorpay.com/v1/subscriptions`
- **Key Field**: `total_count: 0` (unlimited billing cycles)
- **Returns**: `subscription_id`
- **Auto-Renewal**: ✅ YES
- **Payment Type**: `subscription`

### **💰 ONE-TIME SYSTEM**
- **API Endpoint**: `https://api.razorpay.com/v1/orders`
- **Key Field**: Single payment amount
- **Returns**: `order_id`
- **Auto-Renewal**: ❌ NO
- **Payment Type**: `one_time`

---

## 🧪 **TESTING METHODOLOGY**

To determine which system you're actually using:

1. **Check the response**: 
   - Subscription system returns `subscription_id`
   - One-time system returns `order_id`

2. **Check the amount**:
   - Both should show ₹199 for Pro plan
   - But subscription will have auto-renewal

3. **Check the Razorpay checkout**:
   - Subscription checkout shows "Monthly subscription"
   - One-time checkout shows "One-time payment"

---

## 🎯 **CONCLUSION**

Your subscription system IS properly built and should work. The issue might be:

1. **Frontend routing**: Which button calls which function
2. **Environment variables**: Missing credentials
3. **Database state**: Missing plan IDs

**Next step**: Test both systems with proper authentication to see which one you're actually hitting.**
