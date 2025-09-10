# 🚀 Step-by-Step Subscription Setup

## ✅ Your Plan IDs from Razorpay Dashboard:
- **Pro Plan**: `plan_REN5cBATpXrR7S`
- **Business Plan**: `plan_RENZeCMJQuFc8n`

---

## 📋 Step 1: Update Database

Go to your **Supabase Dashboard** → **SQL Editor** and run these commands **one by one**:

### Command 1: Add Plan ID Column
```sql
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS razorpay_plan_id_inr TEXT;
```

### Command 2: Update Pro Plan
```sql
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_REN5cBATpXrR7S'
WHERE name = 'Pro';
```

### Command 3: Update Business Plan
```sql
UPDATE public.subscription_plans 
SET razorpay_plan_id_inr = 'plan_RENZeCMJQuFc8n'
WHERE name = 'Business';
```

### Command 4: Add Subscription Tracking
```sql
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;
```

### Command 5: Verify Updates
```sql
SELECT 
  name, 
  price_monthly, 
  razorpay_plan_id_inr,
  CASE 
    WHEN razorpay_plan_id_inr IS NOT NULL THEN 'Configured ✅'
    ELSE 'Missing ❌'
  END as status
FROM public.subscription_plans
WHERE name IN ('Free', 'Pro', 'Business')
ORDER BY name;
```

**Expected Result:**
- Free: NULL (no plan ID needed)
- Pro: plan_REN5cBATpXrR7S ✅
- Business: plan_RENZeCMJQuFc8n ✅

---

## 🔧 Step 2: Deploy Edge Function

The edge function has been updated with your plan IDs. You need to deploy it:

### Option A: Using Supabase CLI
```bash
supabase functions deploy create-razorpay-subscription
```

### Option B: Manual Deployment
1. Go to **Supabase Dashboard** → **Edge Functions**
2. Find `create-razorpay-subscription` function
3. Replace the content with the updated code from `supabase/functions/create-razorpay-subscription/index.ts`

---

## 🔑 Step 3: Set Environment Variables

In **Supabase Dashboard** → **Settings** → **Edge Functions** → **Environment Variables**:

```
RAZORPAY_KEY_ID=your_actual_razorpay_key_id
RAZORPAY_KEY_SECRET=your_actual_razorpay_secret
```

---

## 🔗 Step 4: Configure Webhook

In **Razorpay Dashboard** → **Settings** → **Webhooks**:

- **URL**: `https://dlzshcshqjdghmtzlbma.supabase.co/functions/v1/razorpay-webhook`
- **Events**: 
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.cancelled`
  - `payment.captured`
  - `payment.failed`

---

## 🧪 Step 5: Test the System

1. **Open your FAQify dashboard**
2. **Click "Upgrade to Pro"**
3. **Check browser console** for any errors
4. **Complete the payment** in Razorpay
5. **Verify plan activation** in your dashboard

---

## 🔍 Step 6: Verify Everything Works

### Check Database:
```sql
-- Check if subscription was created
SELECT * FROM user_subscriptions WHERE plan_tier != 'Free';

-- Check payment transactions
SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 5;
```

### Check Logs:
- **Supabase Dashboard** → **Edge Functions** → **Logs**
- Look for `create-razorpay-subscription` function logs

---

## 🚨 Troubleshooting

### If Subscription Creation Fails:
1. Check Supabase edge function logs
2. Verify environment variables are set
3. Ensure plan IDs match exactly
4. Check Razorpay credentials

### If Payment Doesn't Activate Plan:
1. Check webhook configuration
2. Verify webhook URL is accessible
3. Check webhook logs in Razorpay dashboard
4. Check Supabase webhook function logs

---

## ✅ Success Indicators

You'll know it's working when:
- ✅ Database shows correct plan IDs
- ✅ Subscription creation returns success
- ✅ Razorpay checkout opens properly
- ✅ Payment completion activates plan
- ✅ Dashboard shows updated plan status
- ✅ FAQ limits are updated correctly

---

## 📞 Next Steps

After completing these steps:
1. Test with a small amount first
2. Verify webhook events are received
3. Check real-time plan updates
4. Test FAQ generation with new limits

Your subscription system should now be fully functional with your actual Razorpay plan IDs!
