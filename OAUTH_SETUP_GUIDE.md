# 🔐 OAuth Setup Guide - Google & GitHub Authentication

This guide will help you configure Google and GitHub OAuth authentication for your FAQify application.

## 📋 Overview

The OAuth functionality is already implemented in the code. You just need to configure the providers in Supabase and set up the OAuth applications.

## 🔧 Current Implementation Status

✅ **Frontend Code**: OAuth buttons and handlers are implemented  
✅ **Auth Hook**: `signInWithGoogle()` and `signInWithGitHub()` functions ready  
✅ **UI Components**: Login and SignUp pages have OAuth buttons  
❌ **Supabase Config**: OAuth providers need to be configured  
❌ **OAuth Apps**: Google and GitHub apps need to be created  

## 🚀 Setup Instructions

### 1. Configure Google OAuth

#### Step 1: Create Google OAuth App
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Web application"
   - Add authorized redirect URIs:
     ```
     https://your-project-ref.supabase.co/auth/v1/callback
     http://localhost:54321/auth/v1/callback
     ```
5. Copy the **Client ID** and **Client Secret**

#### Step 2: Configure in Supabase
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to "Authentication" > "Providers"
3. Find "Google" and click "Configure"
4. Enable Google provider
5. Enter your Google OAuth credentials:
   - **Client ID**: From Google Cloud Console
   - **Client Secret**: From Google Cloud Console
6. Save the configuration

### 2. Configure GitHub OAuth

#### Step 1: Create GitHub OAuth App
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the application details:
   - **Application name**: FAQify AI
   - **Homepage URL**: `http://localhost:8082` (for development)
   - **Authorization callback URL**: 
     ```
     https://your-project-ref.supabase.co/auth/v1/callback
     ```
4. Click "Register application"
5. Copy the **Client ID** and generate a **Client Secret**

#### Step 2: Configure in Supabase
1. In Supabase Dashboard, go to "Authentication" > "Providers"
2. Find "GitHub" and click "Configure"
3. Enable GitHub provider
4. Enter your GitHub OAuth credentials:
   - **Client ID**: From GitHub OAuth App
   - **Client Secret**: From GitHub OAuth App
5. Save the configuration

### 3. Update Supabase Configuration

#### Update Site URL and Redirect URLs
1. In Supabase Dashboard, go to "Authentication" > "URL Configuration"
2. Set **Site URL**: `http://localhost:8082` (for development)
3. Add **Redirect URLs**:
   ```
   http://localhost:8082/dashboard
   http://localhost:8082/
   https://your-production-domain.com/dashboard
   https://your-production-domain.com/
   ```

#### Update Local Supabase Config
Update your `supabase/config.toml`:

```toml
[auth]
enabled = true
site_url = "http://localhost:8082"
additional_redirect_urls = [
  "http://localhost:8082/dashboard",
  "https://your-production-domain.com/dashboard"
]
jwt_expiry = 3600
enable_signup = true

[auth.external.google]
enabled = true
client_id = "your-google-client-id"
secret = "your-google-client-secret"

[auth.external.github]
enabled = true
client_id = "your-github-client-id"
secret = "your-github-client-secret"
```

## 🧪 Testing OAuth

### Test Google OAuth
1. Go to `http://localhost:8082/login`
2. Click "Continue with Google"
3. Should redirect to Google login
4. After authentication, should redirect to dashboard

### Test GitHub OAuth
1. Go to `http://localhost:8082/signup`
2. Click "Continue with GitHub"
3. Should redirect to GitHub login
4. After authentication, should redirect to dashboard

## 🔍 Troubleshooting

### Common Issues

#### 1. "OAuth provider not configured"
- **Solution**: Make sure providers are enabled in Supabase Dashboard
- Check that Client ID and Secret are correctly entered

#### 2. "Redirect URI mismatch"
- **Solution**: Ensure redirect URIs match exactly in both OAuth app and Supabase
- Common format: `https://your-project-ref.supabase.co/auth/v1/callback`

#### 3. "Invalid client"
- **Solution**: Double-check Client ID and Secret
- Make sure OAuth app is not in development mode (for production)

#### 4. OAuth works but user not created
- **Solution**: Check if `handle_new_user()` trigger is working
- Verify database permissions and functions

### Debug Steps
1. Check browser console for errors
2. Check Supabase Auth logs in dashboard
3. Verify OAuth app settings in Google/GitHub
4. Test with different browsers/incognito mode

## 📝 Production Deployment

### Update OAuth Apps for Production
1. **Google**: Add production domain to authorized origins
2. **GitHub**: Update homepage URL and callback URL
3. **Supabase**: Update site URL and redirect URLs

### Environment Variables
No additional environment variables needed - OAuth is configured through Supabase Dashboard.

## ✅ Verification Checklist

- [ ] Google OAuth app created with correct redirect URI
- [ ] GitHub OAuth app created with correct callback URL
- [ ] Google provider enabled in Supabase with correct credentials
- [ ] GitHub provider enabled in Supabase with correct credentials
- [ ] Site URL configured in Supabase
- [ ] Redirect URLs added to Supabase
- [ ] Local config.toml updated (if using local Supabase)
- [ ] OAuth buttons work on login page
- [ ] OAuth buttons work on signup page
- [ ] Users can authenticate and access dashboard
- [ ] New users get Free plan automatically

## 🎯 Expected Behavior

After successful setup:
1. **Login Page**: Google and GitHub buttons redirect to respective OAuth flows
2. **Signup Page**: Same OAuth flows work for new user registration
3. **User Creation**: New OAuth users automatically get Free plan (5 FAQs)
4. **Dashboard Access**: OAuth users can access dashboard immediately
5. **Profile Data**: User profile populated with OAuth provider data

The OAuth implementation is already complete in the code - you just need to configure the providers! 🚀
