# 🔧 OAuth Branding Fix - Change App Name to "FAQify"

## 🚨 **ISSUE IDENTIFIED**
During Google OAuth login, users see "dlzshcshqjdghmtzlbma.supabase.co" instead of "FAQify"

## 🎯 **SOLUTION: Update Google OAuth Application**

### **Method 1: Edit Existing OAuth App (Recommended)**

#### **Step 1: Access Google Cloud Console**
1. Go to: https://console.cloud.google.com/
2. Select your project (or create new one)
3. Navigate to: **APIs & Services** → **Credentials**

#### **Step 2: Find Your OAuth Client**
1. Look for **OAuth 2.0 Client IDs** section
2. Find the client currently used by FAQify
3. Click on the **client name** to edit

#### **Step 3: Update Application Details**
```
Application Name: FAQify
Application Homepage: https://your-domain.com (or localhost for dev)
Application Logo: Upload FAQify logo (optional)
```

#### **Step 4: Update Authorized Domains**
```
Authorized JavaScript origins:
- http://localhost:8081 (for development)
- https://your-production-domain.com

Authorized redirect URIs:
- https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback
- http://localhost:54321/auth/v1/callback (for local dev)
```

#### **Step 5: Save Changes**
1. Click **"Save"**
2. Changes take effect immediately

---

### **Method 2: Create New OAuth App (Clean Slate)**

#### **Step 1: Create New OAuth Application**
1. In Google Cloud Console → **APIs & Services** → **Credentials**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth 2.0 Client ID"**
3. Choose **"Web application"**

#### **Step 2: Configure Application**
```
Name: FAQify
Authorized JavaScript origins:
- http://localhost:8081
- https://your-production-domain.com

Authorized redirect URIs:
- https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback
```

#### **Step 3: Get New Credentials**
1. Copy the new **Client ID**
2. Copy the new **Client Secret**

#### **Step 4: Update Supabase Configuration**
1. Go to: https://supabase.com/dashboard
2. Select your project: `dlzshcshqjdghmtzlbma`
3. Navigate to: **Authentication** → **Providers**
4. Click **"Google"** to configure
5. Update with new credentials:
   - **Client ID**: [New Client ID]
   - **Client Secret**: [New Client Secret]
6. Save configuration

---

## 🎨 **OPTIONAL: Add FAQify Branding**

### **Application Logo**
1. Create 120x120px FAQify logo
2. Upload in Google OAuth app settings
3. Users will see FAQify logo during authentication

### **OAuth Consent Screen**
1. Go to: **APIs & Services** → **OAuth consent screen**
2. Update application details:
   ```
   Application name: FAQify
   Application logo: Upload FAQify logo
   Application homepage: https://your-domain.com
   Application privacy policy: https://your-domain.com/privacy
   Application terms of service: https://your-domain.com/terms
   ```

---

## 🧪 **TESTING THE FIX**

### **Test OAuth Branding**
1. Clear browser cache/cookies
2. Go to: http://localhost:8081/login
3. Click **"Continue with Google"**
4. Should now show **"FAQify"** instead of Supabase URL

### **Expected Result**
```
Before: "You're signing back in to dlzshcshqjdghmtzlbma.supabase.co"
After:  "You're signing back in to FAQify"
```

---

## ⚡ **IMMEDIATE STEPS**

### **Quick Fix (5 minutes):**
1. **Google Cloud Console** → **Credentials**
2. **Edit existing OAuth client**
3. **Change name to "FAQify"**
4. **Save**
5. **Test login**

### **Complete Branding (15 minutes):**
1. **Follow Method 2** (create new OAuth app)
2. **Add FAQify logo**
3. **Update OAuth consent screen**
4. **Update Supabase with new credentials**
5. **Test complete flow**

---

## 🔍 **TROUBLESHOOTING**

### **Issue: Changes not reflecting**
- **Solution**: Clear browser cache and cookies
- **Wait**: Changes can take 5-10 minutes to propagate

### **Issue: OAuth stops working**
- **Solution**: Verify redirect URIs are correct
- **Check**: Client ID and Secret in Supabase match Google

### **Issue: "App not verified" warning**
- **Solution**: Submit app for verification (for production)
- **Development**: Users can click "Advanced" → "Go to FAQify"

---

## 📋 **CURRENT OAUTH CONFIGURATION**

### **Your Supabase Project:**
- **URL**: https://dlzshcshqjdghmtzlbma.supabase.co
- **Project ID**: dlzshcshqjdghmtzlbma

### **Required Redirect URI:**
```
https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback
```

### **Development URLs:**
```
http://localhost:8081 (your app)
http://localhost:54321/auth/v1/callback (local Supabase)
```

---

## 🎉 **EXPECTED OUTCOME**

After implementing this fix:
- ✅ Users see **"FAQify"** during Google login
- ✅ Professional branding throughout OAuth flow
- ✅ No more Supabase URL confusion
- ✅ Improved user trust and experience

**This is a Google Cloud Console configuration change, not a code change!**
