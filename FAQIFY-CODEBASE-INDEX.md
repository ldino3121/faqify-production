# 📚 FAQify Codebase Index & Business Logic

## 🏗️ **ARCHITECTURE OVERVIEW**

FAQify is a comprehensive AI-powered FAQ generation SaaS platform built with:
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Shadcn/UI
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **AI Engine**: Google Gemini API for content analysis and FAQ generation
- **Payments**: Dual gateway (Stripe + Razorpay) for global coverage
- **Authentication**: Supabase Auth with OAuth (Google + GitHub)
- **Real-time**: PostgreSQL subscriptions for live data sync

---

## 📁 **CODEBASE STRUCTURE**

### **Frontend Components (`src/`)**
```
src/
├── pages/
│   ├── Index.tsx              # Landing page with pricing
│   ├── Dashboard.tsx          # Main dashboard with 4 tabs
│   ├── Login.tsx              # Authentication page
│   ├── SignUp.tsx             # User registration
│   └── Demo.tsx               # Demo functionality
├── components/
│   ├── dashboard/
│   │   ├── DashboardOverviewData.tsx    # Usage stats & analytics
│   │   ├── FAQCreator.tsx               # Core FAQ generation
│   │   ├── FAQManager.tsx               # Manage saved FAQs
│   │   ├── PlanUpgradeData.tsx          # Subscription management
│   │   └── DashboardHeader.tsx          # Navigation & user info
│   ├── sections/
│   │   ├── Hero.tsx                     # Landing page hero
│   │   ├── Pricing.tsx                  # Pricing plans & payment
│   │   ├── Features.tsx                 # Feature showcase
│   │   └── FAQ.tsx                      # Landing page FAQs
│   └── layout/
│       ├── Header.tsx                   # Site navigation
│       └── Footer.tsx                   # Site footer
├── hooks/
│   ├── useAuth.tsx                      # Authentication management
│   ├── useSubscription.tsx              # Real-time subscription data
│   └── usePricingMigration.tsx          # Auto-pricing updates
└── integrations/
    └── supabase/
        ├── client.ts                    # Supabase configuration
        └── types.ts                     # Database type definitions
```

### **Backend Functions (`supabase/functions/`)**
```
supabase/functions/
├── analyze-content/             # Core FAQ generation engine
├── get-faq-widget/             # Widget data retrieval
├── track-analytics/            # Usage analytics tracking
├── get-analytics/              # Analytics data aggregation
├── create-checkout-session/    # Stripe payment processing
├── create-razorpay-order/      # Razorpay payment processing
├── verify-razorpay-payment/    # Payment verification
├── stripe-webhook/             # Stripe webhook handler
├── razorpay-webhook/           # Razorpay webhook handler
└── apply-pricing-migration/    # Automated pricing updates
```

### **Database Schema (`supabase/migrations/`)**
```
Database Tables:
├── profiles                    # User profile information
├── subscription_plans          # Available pricing plans
├── user_subscriptions         # User subscription status
├── faq_collections            # FAQ groups/collections
├── faqs                       # Individual FAQ items
├── usage_analytics            # User activity tracking
├── payment_transactions       # Payment history
└── subscription_history       # Plan change audit trail
```

---

## 🔄 **COMPLETE BUSINESS LOGIC FLOW**

### **1. User Onboarding Journey**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Landing Page  │ -> │   Sign Up       │ -> │   Dashboard     │
│   (Pricing)     │    │   (Auth)        │    │   (Free Plan)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         v                       v                       v
   View pricing plans      Create account         Start with 5 FAQs
   Compare features        OAuth/Email signup     Explore features
   Start free trial        Auto-profile creation  Generate first FAQ
```

**Technical Implementation:**
- **Landing Page**: `src/pages/Index.tsx` → `src/components/sections/Pricing.tsx`
- **Authentication**: `src/hooks/useAuth.tsx` → Supabase Auth
- **Auto-Setup**: Database trigger `handle_new_user()` creates profile + Free plan
- **Real-time Sync**: `src/hooks/useSubscription.tsx` updates UI instantly

### **2. FAQ Generation Workflow**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Input Content │ -> │   AI Processing │ -> │   Save & Embed  │
│   (URL/Text)    │    │   (Gemini API)  │    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         v                       v                       v
   Check usage limits      Extract main content    Create collection
   Validate input          Generate 4-6 FAQs       Save individual FAQs
   Track analytics         Filter author bios      Generate embed code
```

**Technical Implementation:**
- **Frontend**: `src/components/dashboard/FAQCreator.tsx`
- **Backend**: `supabase/functions/analyze-content/index.ts`
- **Usage Control**: `increment_faq_usage_by_count()` database function
- **Content Intelligence**: Enhanced filtering for main content vs author bios
- **Analytics**: `supabase/functions/track-analytics/index.ts`

### **3. Subscription Management Flow**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Plan Upgrade  │ -> │   Payment       │ -> │   Activation    │
│   (Dashboard)   │    │   (Stripe/Razorpay)│ │   (Real-time)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         v                       v                       v
   Select plan tier        Process payment         Update limits
   Choose payment method   Verify transaction      Reset usage counter
   Review features         Handle webhooks         Sync UI instantly
```

**Technical Implementation:**
- **Plan Selection**: `src/components/dashboard/PlanUpgradeData.tsx`
- **Payment Processing**: 
  - Stripe: `supabase/functions/create-checkout-session/index.ts`
  - Razorpay: `supabase/functions/create-razorpay-order/index.ts`
- **Verification**: `supabase/functions/verify-razorpay-payment/index.ts`
- **Real-time Updates**: PostgreSQL subscriptions in `useSubscription.tsx`

---

## 🎯 **CORE BUSINESS RULES**

### **Subscription Tiers & Limits**
```
Free Plan:     5 FAQs/month   | $0
Pro Plan:      100 FAQs/month | $9/month
Business Plan: 500 FAQs/month | $29/month
```

### **Usage Enforcement**
- **Pre-generation Check**: `canCreateFAQ()` validates remaining quota
- **Post-generation Update**: `incrementUsage()` decrements available count
- **Monthly Reset**: `check_and_reset_user_usage()` resets on plan anniversary
- **Real-time Sync**: UI updates immediately via PostgreSQL subscriptions

### **Content Processing Rules**
- **Supported Inputs**: URLs, text, file uploads
- **Content Intelligence**: Filters author bios, focuses on main content
- **Quality Control**: Minimum content length, relevance scoring
- **Error Handling**: Graceful fallbacks for failed extractions

### **Analytics & Tracking**
- **User Actions**: FAQ generation, exports, embeds, views
- **Collection Metrics**: View counts, click rates, engagement
- **Subscription Events**: Upgrades, downgrades, renewals
- **Real-time Dashboard**: Live usage statistics and trends

---

## 🔧 **KEY TECHNICAL COMPONENTS**

### **Authentication System**
- **Methods**: Email/password, Google OAuth, GitHub OAuth
- **Session Management**: Supabase Auth with automatic token refresh
- **Profile Creation**: Automatic via `handle_new_user()` trigger
- **Security**: Row Level Security (RLS) policies on all tables

### **Real-time Data Sync**
- **Technology**: PostgreSQL subscriptions via Supabase
- **Components**: `useSubscription.tsx`, `useAuth.tsx`
- **Updates**: Instant UI refresh on plan changes, usage updates
- **Reliability**: Automatic reconnection and error handling

### **Payment Integration**
- **Dual Gateway**: Stripe (global) + Razorpay (India-focused)
- **Currency Support**: USD, INR, EUR, GBP
- **Security**: Webhook verification, transaction logging
- **User Experience**: Embedded checkout, instant activation

### **AI Content Processing**
- **Engine**: Google Gemini API with bulletproof configuration
- **Intelligence**: Multi-layer content filtering and scoring
- **Quality**: Author bio detection, main content extraction
- **Reliability**: Multiple fallback strategies, error recovery

---

## 📊 **DATABASE RELATIONSHIPS**

```
profiles (users)
    ├── user_subscriptions (1:1) - Plan & usage data
    ├── faq_collections (1:many) - User's FAQ groups
    ├── usage_analytics (1:many) - Activity tracking
    └── payment_transactions (1:many) - Payment history

faq_collections
    ├── faqs (1:many) - Individual FAQ items
    └── collection_analytics (1:many) - Performance metrics

subscription_plans
    └── user_subscriptions (1:many) - Plan assignments
```

### **Critical Database Functions**
- `handle_new_user()` - Auto-creates profile + Free plan on signup
- `increment_faq_usage_by_count()` - Enforces usage limits
- `check_and_reset_user_usage()` - Monthly usage reset
- `track_simple_analytics()` - Records user actions

---

## 🚀 **DEPLOYMENT & CONFIGURATION**

### **Environment Variables**
```
SUPABASE_URL=https://dlzshcshqjdghmtzlbma.supabase.co
SUPABASE_ANON_KEY=[public key]
SUPABASE_SERVICE_ROLE_KEY=[private key]
GEMINI_API_KEY=AIzaSyCnpPwL11BpSd2jIQwK3N-BlH2g5fMgQOY
STRIPE_SECRET_KEY=[stripe key]
RAZORPAY_KEY_ID=[razorpay key]
RAZORPAY_KEY_SECRET=[razorpay secret]
```

### **Key URLs**
- **Production**: https://dlzshcshqjdghmtzlbma.supabase.co
- **Local Dev**: http://localhost:8081
- **Dashboard**: /dashboard
- **API Base**: /functions/v1/

---

## 🔄 **DETAILED COMPONENT INTERACTIONS**

### **FAQ Generation Process (Step-by-Step)**
```
1. User Input (FAQCreator.tsx)
   ├── URL/Text/File validation
   ├── Usage limit check (useSubscription.tsx)
   └── Progress tracking (React state)

2. Content Analysis (analyze-content edge function)
   ├── Content extraction & cleaning
   ├── Author bio filtering
   ├── Main content scoring
   └── Gemini API processing

3. Database Storage
   ├── Create faq_collections record
   ├── Insert individual faqs
   ├── Update usage analytics
   └── Increment user quota

4. Real-time UI Update
   ├── PostgreSQL subscription triggers
   ├── useSubscription hook refresh
   └── Dashboard counter update
```

### **Payment Flow (Dual Gateway)**
```
1. Plan Selection (PlanUpgradeData.tsx)
   ├── Display pricing tiers
   ├── Currency detection
   └── Gateway selection (Stripe/Razorpay)

2. Payment Processing
   ├── create-razorpay-order OR create-checkout-session
   ├── Frontend payment widget
   └── User payment completion

3. Verification & Activation
   ├── Webhook verification (stripe-webhook/razorpay-webhook)
   ├── Database subscription update
   ├── Usage limit adjustment
   └── Real-time UI sync
```

### **Analytics Tracking System**
```
1. Event Capture
   ├── Frontend actions (FAQ generation, exports, views)
   ├── Widget interactions (embed loads, FAQ clicks)
   └── User behavior (session tracking)

2. Data Processing (track-analytics edge function)
   ├── Event validation & enrichment
   ├── Database insertion (usage_analytics)
   └── Aggregation functions

3. Dashboard Display (DashboardOverviewData.tsx)
   ├── Real-time data fetching
   ├── Chart generation
   └── Performance metrics
```

---

## 🎯 **BUSINESS LOGIC VALIDATION**

### **Content Extraction Intelligence**
The system implements sophisticated content filtering to ensure FAQ quality:

1. **Author Bio Detection**: Filters out journalist/writer biographical information
2. **Main Content Focus**: Prioritizes article subject matter over secondary content
3. **Quality Scoring**: Multi-factor content relevance assessment
4. **Fallback Strategies**: Multiple extraction methods for reliability

### **Subscription Enforcement**
Robust usage tracking and limit enforcement:

1. **Pre-Generation Validation**: Checks available quota before processing
2. **Atomic Operations**: Database functions ensure consistency
3. **Real-time Updates**: Immediate UI reflection of usage changes
4. **Monthly Reset Logic**: Automatic quota renewal on plan anniversary

### **Payment Security**
Enterprise-grade payment processing:

1. **Dual Gateway Support**: Stripe (global) + Razorpay (India)
2. **Webhook Verification**: Cryptographic signature validation
3. **Transaction Logging**: Complete audit trail
4. **Instant Activation**: Real-time subscription updates

This comprehensive index provides a complete understanding of FAQify's architecture, business logic, and technical implementation. Each component is designed to work together seamlessly to deliver a robust, scalable FAQ generation platform.
