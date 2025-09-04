#!/usr/bin/env node

/**
 * OAuth Setup Helper Script
 * This script helps configure OAuth providers for FAQify
 */

console.log('🔐 FAQify OAuth Setup Helper\n');
console.log('This script will help you configure Google and GitHub OAuth.\n');

console.log('📋 STEP 1: Create OAuth Applications');
console.log('');
console.log('🔸 Google OAuth App:');
console.log('   1. Go to: https://console.cloud.google.com/');
console.log('   2. Create new project or select existing');
console.log('   3. Enable Google+ API');
console.log('   4. Create OAuth 2.0 Client ID');
console.log('   5. Add redirect URI: https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback');
console.log('');
console.log('🔸 GitHub OAuth App:');
console.log('   1. Go to: https://github.com/settings/developers');
console.log('   2. Click "New OAuth App"');
console.log('   3. Set callback URL: https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback');
console.log('');

console.log('📋 STEP 2: Configure in Supabase Dashboard');
console.log('');
console.log('🔸 Enable Providers:');
console.log('   1. Go to your Supabase Dashboard');
console.log('   2. Navigate to Authentication > Providers');
console.log('   3. Enable Google provider and enter Client ID & Secret');
console.log('   4. Enable GitHub provider and enter Client ID & Secret');
console.log('');

console.log('🔸 Set Redirect URLs:');
console.log('   1. Go to Authentication > URL Configuration');
console.log('   2. Set Site URL: http://localhost:8082');
console.log('   3. Add Redirect URLs:');
console.log('      - http://localhost:8082/dashboard');
console.log('      - http://localhost:8082/');
console.log('');

console.log('📋 STEP 3: Test OAuth');
console.log('');
console.log('🔸 Test the setup:');
console.log('   1. Start your app: npm run dev');
console.log('   2. Go to: http://localhost:8082/login');
console.log('   3. Click "Continue with Google" or "Continue with GitHub"');
console.log('   4. Should redirect to provider and back to dashboard');
console.log('');

console.log('🔍 Important URLs:');
console.log('');
console.log('📌 Your Supabase Project:');
console.log('   URL: https://dlzshcshqjdghmtzlbma.supabase.co');
console.log('   Project Ref: dlzshcshqjdghmtzlbma');
console.log('');
console.log('📌 OAuth Redirect URI (use this in Google & GitHub):');
console.log('   https://dlzshcshqjdghmtzlbma.supabase.co/auth/v1/callback');
console.log('');

console.log('✅ Setup Complete!');
console.log('');
console.log('📖 For detailed instructions, see: OAUTH_SETUP_GUIDE.md');
console.log('🧪 To test configuration, open: test-oauth.html in your browser');
console.log('');

console.log('🚀 Ready to set up OAuth? Follow the steps above!');
console.log('');
console.log('💡 Need help? Check these files:');
console.log('   📄 OAUTH_SETUP_GUIDE.md - Detailed instructions');
console.log('   🧪 test-oauth.html - Test your configuration');
console.log('   📖 SETUP_GUIDE.md - Complete setup guide');
