# 🔧 FINAL OAuth Branding Fix - Change "dlzshcshqjdghmtzlbma.supabase.co" to "FAQify"

## 🚨 **CURRENT ISSUE**
Google OAuth login shows: **"You're signing back in to dlzshcshqjdghmtzlbma.supabase.co"**
**GOAL**: Change to: **"You're signing back in to FAQify"**

## 🎯 **SOLUTION: Update Google Cloud Console OAuth Application**

### **STEP 1: Access Google Cloud Console**
1. Go to: https://console.cloud.google.com/
2. **Select your project** (the one with your OAuth credentials)
3. Navigate to: **APIs & Services** → **Credentials**

### **STEP 2: Find Your Current OAuth Client**
1. Look for **"OAuth 2.0 Client IDs"** section
2. Find the client currently used by FAQify (probably named something like "Web client 1" or similar)
3. **Click on the client name** to edit it

### **STEP 3: Update Application Name**
1. In the OAuth client details page:
   - **Name**: Change to `FAQify`
   - **Authorized JavaScript origins**: Keep existing URLs
   - **Authorized redirect URIs**: Keep existing URLs (should include `https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback`)

2. **Click "SAVE"**

### **STEP 4: Update OAuth Consent Screen (IMPORTANT)**
1. Go to: **APIs & Services** → **OAuth consent screen**
2. Click **"EDIT APP"**
3. Update these fields:
   - **App name**: `FAQify`
   - **User support email**: Your email
   - **App logo**: Upload FAQify logo (optional but recommended)
   - **Application homepage**: `https://your-domain.com` (or localhost for dev)
   - **Application privacy policy**: `https://your-domain.com/privacy`
   - **Application terms of service**: `https://your-domain.com/terms`

4. **Click "SAVE AND CONTINUE"**

### **STEP 5: Test the Fix**
1. **Clear browser cache and cookies**
2. Go to your app: `http://localhost:8082/login`
3. Click **"Continue with Google"**
4. Should now show: **"You're signing back in to FAQify"**

## 🔧 **ALTERNATIVE: Create New OAuth Application**

If editing doesn't work, create a completely new OAuth application:

### **Create New OAuth Client**
1. In Google Cloud Console → **Credentials**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth 2.0 Client ID"**
3. Choose **"Web application"**
4. Configure:
   ```
   Name: FAQify
   Authorized JavaScript origins:
   - http://localhost:8082
   - https://your-production-domain.com
   
   Authorized redirect URIs:
   - https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback
   ```

### **Update Supabase with New Credentials**
1. Copy the new **Client ID** and **Client Secret**
2. Go to: https://supabase.com/dashboard/project/dlzshcshqjdghmtzlbma
3. Navigate to: **Authentication** → **Providers**
4. Click **"Google"** to configure
5. Update with new credentials and save

## 🎨 **BONUS: Add FAQify Logo**
1. Create a 120x120px FAQify logo
2. Upload it in the OAuth consent screen
3. Users will see the FAQify logo during authentication

## ⚡ **QUICK CHECKLIST**
- [ ] Update OAuth client name to "FAQify"
- [ ] Update OAuth consent screen app name to "FAQify"
- [ ] Clear browser cache
- [ ] Test Google login
- [ ] Verify it shows "FAQify" instead of Supabase URL

## 🔍 **TROUBLESHOOTING**

**Issue**: Changes not reflecting immediately
- **Solution**: Clear browser cache and cookies completely
- **Wait**: Changes can take 5-10 minutes to propagate

**Issue**: OAuth stops working after changes
- **Solution**: Verify redirect URIs are exactly correct
- **Check**: `https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback`

## 📋 **CURRENT CONFIGURATION**
- **Supabase Project**: dlzshcshqjdghmtzlbma
- **Required Redirect URI**: `https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback`
- **Development URL**: `http://localhost:8082`

## 🎉 **EXPECTED RESULT**
After this fix:
- ✅ Google login shows **"FAQify"** instead of Supabase URL
- ✅ Professional branding throughout OAuth flow
- ✅ Better user experience and trust

**This is purely a Google Cloud Console configuration change - no code changes needed!**
