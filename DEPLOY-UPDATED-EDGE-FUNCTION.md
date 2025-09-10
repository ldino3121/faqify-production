# 🚀 Deploy Updated Edge Function

## 🎯 WHAT WE FIXED:

1. **✅ Environment Variable Name**: Changed from `RAZORPAY_KEY_SECRET` to `RAZORPAY_SECRET_KEY` to match your Supabase setup
2. **✅ Database Column**: Updated to use `razorpay_plan_id_inr` instead of `razorpay_plan_id`
3. **✅ Frontend Environment**: Added your actual Razorpay key to `.env` file

---

## 🔧 OPTION 1: Manual Update in Supabase Dashboard

1. **Go to Supabase Dashboard** → **Edge Functions** → **create-razorpay-subscription**
2. **Click "Edit Function"**
3. **Replace the entire content** with the updated code from:
   `faqify-ai-spark-main/supabase/functions/create-razorpay-subscription/index.ts`
4. **Click "Save" or "Deploy"**

---

## 🔧 OPTION 2: Copy-Paste Updated Code

Here's the key change you need to make in the Supabase dashboard:

**Find this line (around line 57):**
```typescript
const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
```

**Replace it with:**
```typescript
const razorpayKeySecret = Deno.env.get('RAZORPAY_SECRET_KEY')
```

**And find this section (around line 106-114):**
```typescript
const { data: planData, error: planError } = await supabaseAdminClient
  .from('subscription_plans')
  .select('razorpay_plan_id')
  .eq('name', planId)
  .single();

let razorpayPlanId = planData?.razorpay_plan_id;
```

**Replace it with:**
```typescript
const { data: planData, error: planError } = await supabaseAdminClient
  .from('subscription_plans')
  .select('razorpay_plan_id_inr')
  .eq('name', planId)
  .single();

let razorpayPlanId = planData?.razorpay_plan_id_inr;
```

---

## 🧪 TEST AFTER DEPLOYMENT:

1. **Go to your FAQify dashboard**
2. **Open browser console** (F12)
3. **Run the test script:**

```javascript
// Test subscription creation
const { data, error } = await supabase.functions.invoke('create-razorpay-subscription', {
  body: {
    planId: 'Pro',
    userEmail: 'test@example.com',
    userName: 'Test User',
    currency: 'INR',
    userCountry: 'IN'
  }
});

console.log('Test Result:', { data, error });
```

**Expected Result:**
- ✅ `data.success: true`
- ✅ `data.subscription_id: "sub_xxxxx"`
- ✅ `data.amount: 19900`
- ✅ `data.currency: "INR"`

---

## 🚨 IF STILL NOT WORKING:

**Check these in browser console:**

```javascript
// 1. Check environment variables
console.log('Razorpay Key:', import.meta.env.VITE_RAZORPAY_KEY_ID);

// 2. Check database plan IDs
const { data: plans } = await supabase
  .from('subscription_plans')
  .select('name, razorpay_plan_id_inr')
  .in('name', ['Pro', 'Business']);
console.log('Database Plans:', plans);

// 3. Test edge function directly
const { data, error } = await supabase.functions.invoke('create-razorpay-subscription', {
  body: { planId: 'Pro', userEmail: 'test@test.com', userName: 'Test', currency: 'INR', userCountry: 'IN' }
});
console.log('Edge Function:', { data, error });
```

---

## ✅ AFTER SUCCESSFUL DEPLOYMENT:

1. **Try "Upgrade to Pro"** button in your dashboard
2. **You should see Razorpay subscription checkout** (not one-time payment)
3. **Subscription should have auto-renewal enabled**

**The subscription model should now work correctly!**
