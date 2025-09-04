# 🔧 OAuth Project Name Fix - Complete Guide

## 🚨 **ISSUE: Still Showing Supabase URL**

If you've updated the OAuth client but still see "dlzshcshqjdghmtzlbma.supabase.co", the issue is in the **OAuth Consent Screen** configuration, not the OAuth client.

---

## 🎯 **SOLUTION: Update OAuth Consent Screen**

### **Step 1: Access OAuth Consent Screen**
1. Go to: https://console.cloud.google.com/
2. Select your project
3. Navigate to: **APIs & Services** → **OAuth consent screen**

### **Step 2: Edit App Information**
1. Click **"EDIT APP"** button
2. Update the following fields:

```
App name: FAQify
User support email: your-email@gmail.com
App logo: [Upload FAQify logo - optional]
App domain:
  - Application homepage: https://your-domain.com (or http://localhost:8081 for dev)
  - Application privacy policy: https://your-domain.com/privacy
  - Application terms of service: https://your-domain.com/terms
Developer contact information: your-email@gmail.com
```

### **Step 3: Save and Publish**
1. Click **"SAVE AND CONTINUE"**
2. Go through all steps (Scopes, Test users, Summary)
3. Click **"BACK TO DASHBOARD"**
4. If app is in "Testing" mode, click **"PUBLISH APP"**

---

## 🔍 **ALTERNATIVE: Check Current Settings**

### **Verify OAuth Client Settings**
1. Go to: **APIs & Services** → **Credentials**
2. Click on your OAuth 2.0 Client ID
3. Ensure **Name** is set to "FAQify"

### **Verify Consent Screen Settings**
1. Go to: **APIs & Services** → **OAuth consent screen**
2. Check **App name** shows "FAQify"
3. Check **Publishing status** is "In production" or "Testing"

---

## 🧪 **TESTING STEPS**

### **Clear Browser Data**
1. **Chrome**: Settings → Privacy → Clear browsing data
2. **Select**: Cookies, Cached images, Site data
3. **Time range**: All time
4. **Clear data**

### **Test OAuth Flow**
1. Open **incognito/private window**
2. Go to: http://localhost:8081/login
3. Click **"Continue with Google"**
4. Should now show **"Sign in to FAQify"** instead of Supabase URL

---

## 🚨 **COMMON ISSUES & SOLUTIONS**

### **Issue 1: App Name Not Changing**
**Cause**: OAuth Consent Screen not updated
**Solution**: 
1. Update **OAuth consent screen** (not just OAuth client)
2. Set **App name** to "FAQify"
3. Save and publish

### **Issue 2: Still Shows Old Name**
**Cause**: Browser cache or Google cache
**Solution**:
1. Clear browser cache completely
2. Use incognito/private window
3. Wait 10-15 minutes for Google cache to update

### **Issue 3: "App Not Verified" Warning**
**Cause**: App in testing mode or not verified
**Solution**:
1. **For Development**: Users click "Advanced" → "Go to FAQify"
2. **For Production**: Submit app for verification

### **Issue 4: Changes Not Reflecting**
**Cause**: Multiple projects or wrong project selected
**Solution**:
1. Verify you're in the correct Google Cloud project
2. Check project ID matches your OAuth setup
3. Ensure Supabase is using the correct OAuth credentials

---

## 📋 **VERIFICATION CHECKLIST**

### **Google Cloud Console:**
- [ ] OAuth consent screen shows "FAQify" as app name
- [ ] OAuth client name is "FAQify"
- [ ] App is published (not in testing mode)
- [ ] Authorized redirect URIs include: `https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback`

### **Supabase Dashboard:**
- [ ] Google provider is enabled
- [ ] Client ID matches Google Cloud Console
- [ ] Client Secret matches Google Cloud Console

### **Testing:**
- [ ] Clear browser cache
- [ ] Test in incognito window
- [ ] OAuth shows "Sign in to FAQify"
- [ ] Authentication works correctly

---

## ⚡ **QUICK TROUBLESHOOTING**

### **If Still Not Working:**

1. **Double-check project**: Ensure you're editing the correct Google Cloud project
2. **Verify credentials**: Make sure Supabase has the right Client ID/Secret
3. **Check redirect URI**: Must be exactly `https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback`
4. **Wait for propagation**: Changes can take 10-15 minutes
5. **Try different browser**: Test in completely fresh browser

### **Emergency Reset:**
If nothing works, create a completely new OAuth application:
1. **Create new OAuth client** in Google Cloud Console
2. **Set name to "FAQify"** from the start
3. **Update Supabase** with new credentials
4. **Test immediately**

---

## 🎯 **EXPECTED RESULT**

After following this guide:

**Before:**
```
"You're signing back in to dlzshcshqjdghmtzlbma.supabase.co"
```

**After:**
```
"Sign in to FAQify"
```

---

## 📞 **NEED HELP?**

If you're still seeing the Supabase URL after following all steps:

1. **Screenshot** the current OAuth consent screen settings
2. **Screenshot** the OAuth client settings  
3. **Screenshot** the Supabase Google provider settings
4. **Test** in incognito mode and share results

The issue is definitely in the OAuth consent screen configuration - this guide will fix it! 🎯
