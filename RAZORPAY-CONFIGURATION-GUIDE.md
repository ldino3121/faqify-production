# 🔑 Razorpay Configuration Guide

## 📋 **Required Razorpay Keys**

You mentioned you have generated the Razorpay Key ID and Secret Key. Here's how to configure them:

### **1. Update Environment Variables**

Replace the placeholder values in your `.env` file with your real Razorpay credentials:

```env
# Razorpay Configuration (Primary Payment Gateway)
RAZORPAY_KEY_ID=rzp_live_your_actual_key_id_here
RAZORPAY_SECRET_KEY=your_actual_secret_key_here
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here

# Frontend Razorpay Configuration
VITE_RAZORPAY_KEY_ID=rzp_live_your_actual_key_id_here
```

### **2. Supabase Environment Variables**

In your Supabase Dashboard → Settings → Environment Variables, add:

```
RAZORPAY_KEY_ID = rzp_live_your_actual_key_id_here
RAZORPAY_SECRET_KEY = your_actual_secret_key_here
RAZORPAY_WEBHOOK_SECRET = your_webhook_secret_here
```

### **3. Production vs Test Mode**

**For Testing:**
- Use `rzp_test_` prefix keys
- Set `RAZORPAY_WEBHOOK_SECRET` to test webhook secret

**For Production:**
- Use `rzp_live_` prefix keys
- Set `RAZORPAY_WEBHOOK_SECRET` to live webhook secret

## 🔧 **Webhook Configuration**

### **Step 1: Create Webhook in Razorpay Dashboard**

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Click "Add New Webhook"
3. Set URL: `https://your-supabase-project.supabase.co/functions/v1/razorpay-webhook`
4. Select Events:
   - `payment.captured`
   - `payment.failed`
   - `subscription.activated`
   - `subscription.cancelled`
   - `subscription.completed`

### **Step 2: Get Webhook Secret**

1. After creating webhook, copy the "Webhook Secret"
2. Add it to your environment variables as `RAZORPAY_WEBHOOK_SECRET`

## 🌍 **Multi-Currency Support**

The system supports multiple currencies:

- **USD** - United States Dollar (Default)
- **INR** - Indian Rupee
- **EUR** - Euro
- **GBP** - British Pound

Currency is auto-detected based on user location, but defaults to USD.

## 🎯 **Pricing Configuration**

Current pricing structure (all in USD):

```
Free Plan:    $0/month   - 10 FAQs
Pro Plan:     $9/month   - 100 FAQs  
Business Plan: $29/month - 500 FAQs
```

Razorpay will handle currency conversion automatically.

## 🔄 **Real-time Integration**

The system includes:

✅ **Embedded Checkout** - Users stay on your site
✅ **Real-time Database Sync** - Instant subscription updates
✅ **Webhook Verification** - Secure payment confirmation
✅ **Multi-currency Support** - Global payment acceptance
✅ **Subscription Management** - Automatic plan upgrades

## 🧪 **Testing the Integration**

### **Test Payment Flow:**

1. **Visit Pricing Page:** https://faqify.app/pricing
2. **Click "Choose Pro" or "Choose Business"**
3. **Razorpay Checkout Should Open**
4. **Use Test Card:** 4111 1111 1111 1111
5. **Any CVV and Future Date**
6. **Payment Should Process Successfully**
7. **User Should Be Upgraded Immediately**

### **Verify Integration:**

1. **Check Razorpay Dashboard** for test payments
2. **Check Supabase Database** for updated subscriptions
3. **Check User Dashboard** for plan upgrade
4. **Test FAQ Generation** with new limits

## 🚨 **Important Security Notes**

### **Environment Variables:**
- **Never commit** real keys to Git
- **Use different keys** for development and production
- **Rotate keys** regularly for security

### **Webhook Security:**
- **Always verify** webhook signatures
- **Use HTTPS** for webhook URLs
- **Monitor webhook** logs for suspicious activity

## 📊 **Monitoring & Analytics**

The system tracks:

- **Payment Transactions** in `payment_transactions` table
- **Subscription Changes** in `subscription_history` table
- **Usage Analytics** in `subscription_metrics` table
- **Real-time Updates** via PostgreSQL subscriptions

## 🔧 **Troubleshooting**

### **Common Issues:**

1. **"Payment Gateway Loading"**
   - Check `VITE_RAZORPAY_KEY_ID` is set correctly
   - Verify Razorpay script loads properly

2. **"Payment Failed"**
   - Check webhook configuration
   - Verify secret keys match
   - Check Supabase function logs

3. **"Subscription Not Updated"**
   - Check webhook is receiving events
   - Verify database permissions
   - Check real-time subscriptions

### **Debug Steps:**

1. **Check Browser Console** for JavaScript errors
2. **Check Supabase Logs** for function errors
3. **Check Razorpay Dashboard** for payment status
4. **Check Database** for transaction records

## 🎉 **Ready for Production**

Once configured with real keys:

✅ **Payments will be processed** through Razorpay
✅ **Users will be charged** real money
✅ **Subscriptions will activate** automatically
✅ **FAQ limits will update** in real-time
✅ **Analytics will track** all transactions

**Your FAQify tool is ready for monetization!** 💰
