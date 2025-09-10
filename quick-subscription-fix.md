# Quick Subscription Fix

## Root Cause Summary

The subscription creation is failing because:

1. **Missing Razorpay Plans**: The required subscription plans don't exist in your Razorpay dashboard
2. **Wrong Plan IDs**: The edge function was using incorrect hardcoded plan IDs
3. **Environment Variables**: Razorpay credentials may not be properly configured

## Immediate Fix Steps

### Step 1: Open the Diagnosis Tool
1. Open `diagnose-subscription-issue.html` in your browser
2. Run all the diagnostic tests to identify the exact issue

### Step 2: Check Your Razorpay Dashboard
1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com)
2. Navigate to **Subscriptions** → **Plans**
3. Check if you have any existing plans

### Step 3: Quick Fix Options

**Option A: Use Existing Plans (if any)**
If you have existing plans in Razorpay, update the edge function with their IDs:

1. Copy your actual plan IDs from Razorpay dashboard
2. Update the edge function:

```typescript
// In supabase/functions/create-razorpay-subscription/index.ts
// Replace lines 118-122 with your actual plan IDs:

if (planId === 'Pro') {
  razorpayPlanId = 'your_actual_pro_plan_id'; // Replace with your actual Pro plan ID
} else if (planId === 'Business') {
  razorpayPlanId = 'your_actual_business_plan_id'; // Replace with your actual Business plan ID
}
```

**Option B: Create New Plans**
If you don't have plans, create them in Razorpay Dashboard:

1. Go to **Subscriptions** → **Plans** → **Create Plan**
2. Create these plans:

**Pro Plan:**
- Plan ID: `faqify_pro_monthly_inr`
- Amount: ₹199
- Period: Monthly
- Currency: INR

**Business Plan:**
- Plan ID: `faqify_business_monthly_inr`
- Amount: ₹999
- Period: Monthly
- Currency: INR

### Step 4: Update Environment Variables

Make sure your `.env` file has real Razorpay credentials:

```env
# Replace with your actual Razorpay credentials
RAZORPAY_KEY_ID=rzp_test_your_actual_key_id
RAZORPAY_SECRET_KEY=your_actual_secret_key
VITE_RAZORPAY_KEY_ID=rzp_test_your_actual_key_id
```

### Step 5: Deploy the Fix

If you have Supabase CLI installed:
```bash
supabase functions deploy create-razorpay-subscription
```

If not, you can copy the updated function code to your Supabase dashboard manually.

## Testing

1. Open your FAQify dashboard
2. Try to upgrade to Pro plan
3. Check browser console for errors
4. Check Supabase edge function logs

## Alternative: Temporary Bypass

If you want to test other functionality while fixing this, you can temporarily modify the subscription hook to skip Razorpay and directly update the database:

```typescript
// In src/hooks/useRazorpaySubscription.tsx
// Temporarily replace the createSubscription function with:

createSubscription: async (planId: 'Pro' | 'Business') => {
  // Temporary bypass - directly update user subscription
  const { data, error } = await supabase
    .from('user_subscriptions')
    .update({
      plan_tier: planId,
      plan_status: 'active',
      plan_activated_at: new Date().toISOString(),
      plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    })
    .eq('user_id', user?.id);

  if (error) throw error;
  
  return { success: true };
}
```

**⚠️ Warning**: This bypass is only for testing. Remove it once Razorpay is properly configured.

## Next Steps

1. Run the diagnosis tool first
2. Check your Razorpay dashboard for existing plans
3. Either use existing plan IDs or create new plans
4. Update the edge function accordingly
5. Test the subscription flow

Let me know what the diagnosis tool shows and I'll help you implement the specific fix needed.
