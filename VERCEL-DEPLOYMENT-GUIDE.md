# 🚀 FAQify Vercel Deployment Guide

## 📋 **Complete Step-by-Step Deployment**

### **🎯 Prerequisites**
- ✅ GitHub account
- ✅ Vercel account (free)
- ✅ Domain name (optional, can use Vercel subdomain)
- ✅ All environment variables ready

---

## 🔧 **STEP 1: Prepare Your Code**

### **1.1 Create Production Environment File**
Create `.env.production` in your project root:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://dlzshcshqjdghmtzlbma.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsenNoY3NocWpkZ2htdHpsYm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODUzODgsImV4cCI6MjA2Njc2MTM4OH0.EL4By0nom419JiorSHKiFckLqnh1sqmFvYnWTylB9Gk

# Razorpay Configuration
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id

# Production Mode
NODE_ENV=production
```

### **1.2 Update Package.json Scripts**
Verify your build scripts are correct:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### **1.3 Create Vercel Configuration**
Create `vercel.json` in project root:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ]
}
```

---

## 📁 **STEP 2: GitHub Setup**

### **2.1 Create GitHub Repository**
1. **Go to GitHub.com**
2. **Click "New Repository"**
3. **Name**: `faqify-production`
4. **Set to Public** (for free Vercel)
5. **Click "Create Repository"**

### **2.2 Upload Your Code**
```bash
# In your project directory
git init
git add .
git commit -m "Initial FAQify production setup"
git branch -M main
git remote add origin https://github.com/yourusername/faqify-production.git
git push -u origin main
```

---

## 🌐 **STEP 3: Vercel Deployment**

### **3.1 Create Vercel Account**
1. **Go to vercel.com**
2. **Sign up with GitHub**
3. **Authorize Vercel** to access your repositories

### **3.2 Import Project**
1. **Click "New Project"**
2. **Select your GitHub repository** (`faqify-production`)
3. **Framework**: Auto-detected as Vite
4. **Root Directory**: `./` (default)
5. **Build Command**: `npm run build` (auto-filled)
6. **Output Directory**: `dist` (auto-filled)

### **3.3 Configure Environment Variables**
In Vercel dashboard, add these environment variables:

```
VITE_SUPABASE_URL = https://dlzshcshqjdghmtzlbma.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsenNoY3NocWpkZ2htdHpsYm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODUzODgsImV4cCI6MjA2Njc2MTM4OH0.EL4By0nom419JiorSHKiFckLqnh1sqmFvYnWTylB9Gk
VITE_RAZORPAY_KEY_ID = your_razorpay_key_id
NODE_ENV = production
```

### **3.4 Deploy**
1. **Click "Deploy"**
2. **Wait 2-3 minutes** for build to complete
3. **Get your live URL**: `https://faqify-production.vercel.app`

---

## 🔗 **STEP 4: Custom Domain Setup**

### **4.1 Buy Domain** (Optional)
- **GoDaddy**, **Namecheap**, or **Cloudflare**
- **Suggested**: `yourname-faqify.com` or `faqify-ai.com`

### **4.2 Add Domain in Vercel**
1. **Go to Project Settings** → **Domains**
2. **Add Domain**: `yourdomain.com`
3. **Copy DNS settings** provided by Vercel

### **4.3 Update DNS**
In your domain registrar:
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com

Type: A
Name: @
Value: 76.76.19.61
```

---

## 🔧 **STEP 5: Update OAuth Settings**

### **5.1 Google OAuth Console**
Update authorized domains:
```
Production URL: https://yourdomain.com
Authorized redirect URIs:
- https://yourdomain.com
- https://yourdomain.com/dashboard
```

### **5.2 Supabase Auth Settings**
Update site URL in Supabase:
```
Site URL: https://yourdomain.com
Additional redirect URLs:
- https://yourdomain.com/dashboard
- https://yourdomain.com/
```

---

## ✅ **STEP 6: Verification Checklist**

### **6.1 Test Core Features**
- [ ] **Landing page** loads correctly
- [ ] **Sign up/Login** works with OAuth
- [ ] **Dashboard** accessible after login
- [ ] **FAQ generation** works
- [ ] **Payment system** functional
- [ ] **Embed codes** generate correctly

### **6.2 Performance Check**
- [ ] **Page load speed** < 3 seconds
- [ ] **Mobile responsive** design
- [ ] **SSL certificate** active (https://)
- [ ] **SEO meta tags** present

---

## 🚨 **Common Issues & Solutions**

### **Issue 1: Build Fails**
```bash
# Solution: Check dependencies
npm install
npm run build
```

### **Issue 2: Environment Variables Not Working**
- **Check spelling** in Vercel dashboard
- **Redeploy** after adding variables
- **Use VITE_ prefix** for frontend variables

### **Issue 3: OAuth Redirect Errors**
- **Update Supabase** site URL
- **Update Google OAuth** authorized domains
- **Clear browser cache**

### **Issue 4: API Calls Failing**
- **Check Supabase URL** is correct
- **Verify API keys** are valid
- **Check CORS settings** in Supabase

---

## 📊 **Post-Deployment Monitoring**

### **Vercel Analytics** (Free)
- **Page views** and **performance**
- **Error tracking**
- **User behavior**

### **Supabase Dashboard**
- **Database usage**
- **API calls**
- **User registrations**

---

## 💰 **Cost Breakdown**

### **Free Tier (Start Here)**
```
Vercel:     $0/month (100GB bandwidth)
Domain:     $10-15/year
Supabase:   $0/month (500MB database)
Total:      ~$1-2/month
```

### **Scaling (When Growing)**
```
Vercel Pro: $20/month
Domain:     $10-15/year  
Supabase:   $25/month
Total:      ~$45-50/month
```

---

## 🎯 **Next Steps After Deployment**

1. **✅ Test all functionality** thoroughly
2. **✅ Set up monitoring** and analytics
3. **✅ Create backup strategy**
4. **✅ Plan marketing** and user acquisition
5. **✅ Monitor performance** and costs

**Your FAQify tool will be live and ready for customers!** 🚀

---

## 🎯 **QUICK START COMMANDS**

### **Fix Local Development (If Not Working):**
```bash
# Navigate to correct directory
cd faqify-ai-spark-main\faqify-ai-spark-main

# Start development server
npm run dev

# Should show: http://localhost:8081/
```

### **Test Production Build:**
```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### **Deploy to Vercel (5 Minutes):**
1. **Push to GitHub**: Upload your code
2. **Import to Vercel**: Connect GitHub repo
3. **Add Environment Variables**: Copy from guide above
4. **Deploy**: Click deploy button
5. **Live**: Get your production URL

---

## 🚨 **IMPORTANT NOTES**

### **Directory Structure:**
- **Your project is in**: `faqify-ai-spark-main\faqify-ai-spark-main\`
- **Always navigate there first** before running commands
- **All npm commands** must be run from this directory

### **Environment Variables for Vercel:**
```
VITE_SUPABASE_URL=https://dlzshcshqjdghmtzlbma.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsenNoY3NocWpkZ2htdHpsYm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODUzODgsImV4cCI6MjA2Njc2MTM4OH0.EL4By0nom419JiorSHKiFckLqnh1sqmFvYnWTylB9Gk
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id
NODE_ENV=production
```

### **Build Status:** ✅ **VERIFIED WORKING**
- ✅ **Production build**: Successful (712KB)
- ✅ **Development server**: Running on http://localhost:8081/
- ✅ **All dependencies**: Installed and working
- ✅ **Vercel config**: Created and ready

**Ready for deployment!** 🚀
