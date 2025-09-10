# 🔑 Environment Variables Setup

## 🚨 CRITICAL: Set These Environment Variables

Your subscription system is failing because these environment variables are missing:

### **In Supabase Dashboard → Settings → Edge Functions → Environment Variables:**

```
RAZORPAY_KEY_ID=your_actual_razorpay_key_id
RAZORPAY_KEY_SECRET=your_actual_razorpay_secret
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### **In Your Frontend (.env file):**

```
VITE_RAZORPAY_KEY_ID=your_actual_razorpay_key_id
```

---

## 🔍 How to Get These Values:

### **1. Razorpay Credentials:**
- Go to **Razorpay Dashboard** → **Settings** → **API Keys**
- Copy **Key ID** and **Key Secret**

### **2. Supabase Service Role Key:**
- Go to **Supabase Dashboard** → **Settings** → **API**
- Copy the **service_role** key (not the anon key)

---

## 🧪 Test Environment Variables:

Run this in your browser console on the dashboard:

```javascript
// Test if Razorpay key is available
console.log('Razorpay Key:', import.meta.env.VITE_RAZORPAY_KEY_ID);

// Test edge function
const { data, error } = await supabase.functions.invoke('create-razorpay-subscription', {
  body: {
    planId: 'Pro',
    userEmail: 'test@example.com',
    userName: 'Test User',
    currency: 'INR',
    userCountry: 'IN'
  }
});

console.log('Edge Function Test:', { data, error });
```

---

## 🚨 Common Issues:

### **"Razorpay credentials not configured"**
- Missing `RAZORPAY_KEY_ID` or `RAZORPAY_KEY_SECRET` in Supabase edge functions

### **"Unauthorized"**
- Missing `SUPABASE_SERVICE_ROLE_KEY` in edge functions

### **"Plan not found"**
- Database not updated with plan IDs (run COMPLETE-DATABASE-FIX.sql)

---

## ✅ Verification Steps:

1. **Set environment variables** in Supabase dashboard
2. **Run database fix** (COMPLETE-DATABASE-FIX.sql)
3. **Test subscription creation** in your dashboard
4. **Check browser console** for detailed error logs

**After setting these up, your subscription model should work correctly!**
