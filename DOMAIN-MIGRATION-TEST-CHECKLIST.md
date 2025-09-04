# 🧪 DOMAIN MIGRATION TEST CHECKLIST - faqify.app

## ✅ **COMPLETED CHANGES**

### **1. ✅ Domain Configuration**
- **Vercel**: faqify.app domain added and connected
- **DNS**: Hostinger DNS records configured
- **SSL**: HTTPS certificate active
- **Redirects**: www.faqify.app → faqify.app

### **2. ✅ Code Updates**
- **Widget Config**: Updated to use faqify.app
- **Production Domain**: Changed from netlify.app to faqify.app
- **Fallback Domains**: Updated with new domain hierarchy

### **3. ✅ Supabase Configuration**
- **Site URL**: Updated to https://faqify.app
- **Redirect URLs**: Updated for OAuth flows
- **CORS**: Configured for new domain

### **4. ✅ Search Console**
- **Property Added**: faqify.app verified
- **Sitemap**: Submitted for new domain

---

## 🧪 **COMPREHENSIVE TEST PLAN**

### **Phase 1: Basic Domain & SSL Tests**

#### **Test 1.1: Domain Accessibility** ✅
```bash
# Test primary domain
curl -I https://faqify.app
# Expected: 200 OK, HTTPS active

# Test www redirect
curl -I https://www.faqify.app
# Expected: 301/302 redirect to https://faqify.app
```

#### **Test 1.2: SSL Certificate** ✅
- **Check**: Green lock icon in browser
- **Verify**: Certificate issued by Let's Encrypt/Vercel
- **Test**: No mixed content warnings

### **Phase 2: Application Functionality Tests**

#### **Test 2.1: Landing Page** 
- [ ] **Load Speed**: Page loads within 3 seconds
- [ ] **Responsive**: Works on mobile/tablet/desktop
- [ ] **Navigation**: All menu items work
- [ ] **CTA Buttons**: "Get Started" leads to signup
- [ ] **Pricing**: Plans display correctly

#### **Test 2.2: Authentication System**
- [ ] **Google OAuth**: Login/signup works
- [ ] **GitHub OAuth**: Login/signup works
- [ ] **Email Signup**: Traditional signup works
- [ ] **Redirects**: Post-auth redirects to dashboard
- [ ] **Session**: User stays logged in

#### **Test 2.3: Dashboard Functionality**
- [ ] **Overview Tab**: Displays user stats
- [ ] **Create Tab**: FAQ generation works
- [ ] **Manage Tab**: Shows saved FAQs
- [ ] **Upgrade Tab**: Payment flow works

### **Phase 3: Core FAQ Generation Tests**

#### **Test 3.1: FAQ Generation Engine**
- [ ] **URL Input**: Can analyze any website
- [ ] **Text Input**: Can process pasted content
- [ ] **File Upload**: Can handle document uploads
- [ ] **AI Processing**: Generates relevant FAQs
- [ ] **Database Save**: FAQs save to database

#### **Test 3.2: FAQ Management**
- [ ] **View FAQs**: Can see generated FAQs
- [ ] **Edit FAQs**: Can modify FAQ content
- [ ] **Delete FAQs**: Can remove FAQs
- [ ] **Export**: Can export FAQ data
- [ ] **Analytics**: Usage tracking works

### **Phase 4: Widget & Embed Tests**

#### **Test 4.1: Widget Generation**
- [ ] **Embed Code**: Generates valid embed code
- [ ] **Theme Options**: Different themes work
- [ ] **Customization**: Options apply correctly
- [ ] **Copy Function**: Code copies to clipboard

#### **Test 4.2: Widget Functionality**
- [ ] **External Site**: Widget works on external sites
- [ ] **Elementor**: Works in Elementor HTML widget
- [ ] **Responsive**: Widget is mobile-friendly
- [ ] **Performance**: Loads quickly
- [ ] **API Calls**: Fetches FAQ data correctly

### **Phase 5: Payment & Subscription Tests**

#### **Test 5.1: Razorpay Integration**
- [ ] **Payment Form**: Loads correctly
- [ ] **Test Payment**: Processes test transactions
- [ ] **Plan Upgrade**: Upgrades user plan
- [ ] **Database Update**: Updates subscription in DB
- [ ] **UI Refresh**: Dashboard reflects new plan

#### **Test 5.2: Usage Limits**
- [ ] **Free Plan**: 5 FAQ limit enforced
- [ ] **Pro Plan**: 100 FAQ limit enforced
- [ ] **Business Plan**: 500 FAQ limit enforced
- [ ] **Counter Display**: Shows correct usage
- [ ] **Restriction**: Blocks over-limit generation

### **Phase 6: SEO & Performance Tests**

#### **Test 6.1: SEO Configuration**
- [ ] **Meta Tags**: Proper title/description
- [ ] **Open Graph**: Social sharing works
- [ ] **Sitemap**: XML sitemap accessible
- [ ] **Robots.txt**: Proper crawling rules
- [ ] **Schema Markup**: Structured data present

#### **Test 6.2: Performance Metrics**
- [ ] **Page Speed**: Google PageSpeed > 90
- [ ] **Core Web Vitals**: All metrics green
- [ ] **Bundle Size**: Optimized asset loading
- [ ] **CDN**: Static assets served efficiently

---

## 🚨 **CRITICAL TESTS TO RUN NOW**

### **Immediate Priority Tests:**

1. **🔐 Authentication Flow**
   ```
   1. Go to https://faqify.app
   2. Click "Get Started"
   3. Try Google OAuth login
   4. Verify redirect to dashboard
   ```

2. **🤖 FAQ Generation**
   ```
   1. Login to dashboard
   2. Go to Create tab
   3. Enter URL: https://example.com
   4. Generate FAQs
   5. Verify FAQs save to database
   ```

3. **📊 Widget Generation**
   ```
   1. Generate FAQs
   2. Go to Manage tab
   3. Click "Get Embed Code"
   4. Copy embed code
   5. Test on external site
   ```

4. **💳 Payment Flow**
   ```
   1. Go to Upgrade tab
   2. Select Pro plan
   3. Complete Razorpay payment
   4. Verify plan upgrade
   ```

---

## 🔍 **DEBUGGING CHECKLIST**

### **If Issues Found:**

#### **Domain Issues:**
- [ ] Check DNS propagation: `nslookup faqify.app`
- [ ] Verify Vercel domain status
- [ ] Check SSL certificate validity

#### **Authentication Issues:**
- [ ] Verify Supabase auth settings
- [ ] Check OAuth provider configurations
- [ ] Validate redirect URLs

#### **API Issues:**
- [ ] Check Supabase edge functions
- [ ] Verify environment variables
- [ ] Test API endpoints directly

#### **Widget Issues:**
- [ ] Check widget.js accessibility
- [ ] Verify embed code generation
- [ ] Test CORS configuration

---

## 📈 **SUCCESS METRICS**

### **All Tests Pass When:**
- ✅ Domain loads with HTTPS
- ✅ Authentication works flawlessly
- ✅ FAQ generation produces results
- ✅ Widgets embed on external sites
- ✅ Payments process successfully
- ✅ Database updates in real-time
- ✅ No console errors
- ✅ Mobile responsive
- ✅ Fast loading times

---

## 🎯 **NEXT STEPS AFTER TESTING**

1. **Monitor**: Set up uptime monitoring
2. **Analytics**: Configure Google Analytics
3. **Backup**: Ensure database backups
4. **Documentation**: Update user guides
5. **Marketing**: Launch announcement

**Ready to test! 🚀**
