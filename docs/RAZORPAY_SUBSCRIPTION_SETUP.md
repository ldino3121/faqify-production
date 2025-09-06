# Razorpay Subscription Integration Setup

This guide explains how to set up Razorpay's native subscription feature for automatic recurring payments in FAQify.

## 🎯 **What's Implemented**

### **✅ Features Added:**
- **Native Razorpay Subscriptions** (not custom auto-renewal)
- **Automatic monthly billing** managed by Razorpay
- **Subscription lifecycle management** (pause, resume, cancel)
- **Webhook integration** for real-time subscription updates
- **Payment type toggle** (subscription vs one-time)
- **Subscription dashboard** in user overview

### **🔧 Technical Components:**
1. **Razorpay Plans** - Pre-configured subscription plans
2. **Subscription Creation** - Edge function to create subscriptions
3. **Webhook Handler** - Processes subscription events
4. **Frontend Integration** - Payment type selection and checkout
5. **Database Schema** - Subscription tracking fields

## 📋 **Setup Instructions**

### **Step 1: Configure Razorpay Dashboard**

1. **Login to Razorpay Dashboard**
   - Go to [https://dashboard.razorpay.com](https://dashboard.razorpay.com)
   - Navigate to **Settings > API Keys**
   - Copy your `Key ID` and `Key Secret`

2. **Enable Subscriptions**
   - Go to **Products > Subscriptions**
   - Enable subscription feature if not already enabled
   - Note: May require business verification

3. **Set Up Webhooks**
   - Go to **Settings > Webhooks**
   - Create new webhook with URL: `https://your-domain.com/functions/v1/razorpay-subscription-webhook`
   - Select these events:
     - `subscription.activated`
     - `subscription.charged`
     - `subscription.cancelled`
     - `subscription.paused`
     - `subscription.resumed`
     - `subscription.pending`
     - `subscription.halted`
   - Copy the webhook secret

### **Step 2: Set Environment Variables**

Add these to your `.env` file and Supabase Edge Functions:

```bash
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Frontend (Vite)
VITE_RAZORPAY_KEY_ID=rzp_test_your_key_id
```

### **Step 3: Create Razorpay Plans**

Run the setup script to create subscription plans in Razorpay:

```bash
# Set environment variables and run
RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx npm run setup-razorpay-plans
```

This creates:
- **Pro Plan**: ₹9/month (100 FAQs)
- **Business Plan**: ₹29/month (500 FAQs)

### **Step 4: Deploy Edge Functions**

Deploy the new edge functions to Supabase:

```bash
# Deploy subscription creation function
supabase functions deploy create-razorpay-subscription

# Deploy webhook handler
supabase functions deploy razorpay-subscription-webhook
```

### **Step 5: Run Database Migration**

Apply the database schema changes:

```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20250109000000_add_subscription_management.sql
```

### **Step 6: Test the Integration**

1. **Test Plan Creation**
   ```bash
   npm run setup-razorpay-plans
   ```

2. **Test Subscription Flow**
   - Go to pricing page
   - Toggle to "Auto-Renewal Subscription"
   - Click "Subscribe to Pro" or "Subscribe to Business"
   - Complete payment in Razorpay checkout

3. **Test Webhooks**
   - Use Razorpay webhook testing tool
   - Verify subscription events update database correctly

## 🔄 **How It Works**

### **Subscription Flow:**
1. **User selects plan** → Frontend calls `create-razorpay-subscription`
2. **Edge function creates subscription** → Returns subscription ID
3. **Razorpay checkout opens** → User completes payment
4. **Razorpay sends webhook** → `razorpay-subscription-webhook` processes
5. **Database updated** → User subscription activated

### **Billing Cycle:**
- **Monthly billing** on the same date each month
- **Automatic retries** for failed payments (Razorpay handles)
- **Grace period** before subscription cancellation
- **Email notifications** sent by Razorpay

### **Subscription Management:**
- **Cancel anytime** → Continues until current period ends
- **Pause/Resume** → Temporarily stop billing
- **Upgrade/Downgrade** → Prorated billing adjustments

## 🎛️ **User Experience**

### **Payment Type Selection:**
Users can choose between:
- **🔄 Auto-Renewal Subscription** (Razorpay managed)
- **💳 One-Time Payment** (Manual renewal)

### **Subscription Dashboard:**
- View current subscription status
- See next billing date
- Cancel or modify subscription
- Download invoices (via Razorpay)

## 🔧 **Troubleshooting**

### **Common Issues:**

1. **Plans not created**
   - Check API credentials
   - Ensure subscriptions enabled in Razorpay
   - Verify business account status

2. **Webhooks not working**
   - Check webhook URL is accessible
   - Verify webhook secret matches
   - Check Supabase function logs

3. **Subscription not activating**
   - Check webhook events are configured
   - Verify database permissions
   - Check edge function logs

### **Testing Commands:**

```bash
# Test plan creation
npm run setup-razorpay-plans

# Test webhook locally (if using ngrok)
curl -X POST http://localhost:54321/functions/v1/razorpay-subscription-webhook \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: test_signature" \
  -d '{"event": "subscription.activated", "payload": {...}}'
```

## 📊 **Benefits of Razorpay Subscriptions**

### **vs Custom Auto-Renewal:**
- ✅ **PCI Compliance** - Razorpay handles card storage
- ✅ **Automatic Retries** - Built-in failed payment handling
- ✅ **Dunning Management** - Automated reminder emails
- ✅ **Regulatory Compliance** - RBI guidelines compliance
- ✅ **Customer Portal** - Users can manage subscriptions
- ✅ **Analytics** - Built-in subscription metrics

### **Business Benefits:**
- 📈 **Higher Success Rates** - Optimized payment routing
- 💰 **Reduced Churn** - Smart retry logic
- 🔒 **Security** - No need to store payment methods
- 📧 **Communication** - Automated customer notifications
- 📊 **Insights** - Detailed subscription analytics

## 🚀 **Next Steps**

1. **Enable subscription management** in dashboard overview
2. **Set up customer portal** for self-service
3. **Configure email templates** in Razorpay
4. **Set up analytics tracking** for subscription metrics
5. **Test with real payments** in live mode

## 📞 **Support**

For Razorpay-specific issues:
- [Razorpay Documentation](https://razorpay.com/docs/)
- [Razorpay Support](https://razorpay.com/support/)
- [Subscription API Reference](https://razorpay.com/docs/api/subscriptions/)

For implementation issues:
- Check Supabase function logs
- Review webhook delivery logs in Razorpay
- Test with Razorpay's test mode first
