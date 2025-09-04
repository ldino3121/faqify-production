# 🔄 FAQify Component Interaction Map

## 📊 **SYSTEM OVERVIEW**

FAQify operates as a sophisticated SaaS platform with real-time data synchronization, intelligent content processing, and robust payment handling. This document maps the exact interactions between all components.

---

## 🎯 **CORE INTERACTION PATTERNS**

### **1. Authentication & User Management**

**Components Involved:**
- `src/hooks/useAuth.tsx` (Frontend state management)
- `src/pages/SignUp.tsx` & `src/pages/Login.tsx` (UI components)
- `supabase/auth` (Authentication service)
- `handle_new_user()` (Database trigger)
- `profiles` & `user_subscriptions` tables

**Interaction Flow:**
```
1. User submits credentials → useAuth.tsx
2. useAuth calls Supabase Auth API
3. On success: handle_new_user() trigger fires
4. Creates profile + assigns Free plan (5 FAQs)
5. Real-time subscription updates via PostgreSQL subscriptions
6. useSubscription.tsx receives updates
7. Dashboard UI reflects new user state
```

### **2. FAQ Generation Engine**

**Components Involved:**
- `src/components/dashboard/FAQCreator.tsx` (UI & orchestration)
- `src/hooks/useSubscription.tsx` (Usage validation)
- `supabase/functions/analyze-content/index.ts` (Content processing)
- Google Gemini API (AI generation)
- `faq_collections` & `faqs` tables (Storage)
- `increment_faq_usage_by_count()` (Usage tracking)

**Interaction Flow:**
```
1. User inputs content → FAQCreator.tsx
2. Pre-generation: useSubscription.canCreateFAQ() checks limits
3. If allowed: Call analyze-content edge function
4. analyze-content extracts & filters content
5. Gemini API generates 4-6 FAQs
6. Save collection + individual FAQs to database
7. increment_faq_usage_by_count() updates usage
8. Real-time UI update via PostgreSQL subscription
9. Dashboard counters refresh automatically
```

### **3. Payment & Subscription Management**

**Components Involved:**
- `src/components/dashboard/PlanUpgradeData.tsx` (Plan selection)
- `src/components/sections/Pricing.tsx` (Landing page pricing)
- `supabase/functions/create-razorpay-order/index.ts` (Payment initiation)
- `supabase/functions/verify-razorpay-payment/index.ts` (Payment verification)
- Razorpay/Stripe APIs (Payment processing)
- `payment_transactions` & `user_subscriptions` tables

**Interaction Flow:**
```
1. User selects plan → PlanUpgradeData.tsx
2. Create payment order via edge function
3. Frontend opens payment gateway widget
4. User completes payment
5. Webhook verifies payment signature
6. Update user_subscriptions with new plan
7. Reset usage limits & activation dates
8. Real-time UI sync via useSubscription.tsx
9. Dashboard shows new limits immediately
```

---

## 🔄 **REAL-TIME DATA SYNCHRONIZATION**

### **PostgreSQL Subscriptions**
FAQify uses PostgreSQL's real-time capabilities for instant UI updates:

```typescript
// useSubscription.tsx - Real-time subscription monitoring
const userSubChannel = supabase
  .channel('subscription-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'user_subscriptions',
    filter: `user_id=eq.${user.id}`,
  }, () => {
    fetchSubscription(); // Refresh data
  })
  .subscribe();
```

**Real-time Events:**
- Plan upgrades/downgrades
- Usage counter updates
- Monthly resets
- Payment confirmations

### **State Management Flow**
```
Database Change → PostgreSQL Subscription → React Hook → Component Re-render
```

---

## 🧠 **CONTENT INTELLIGENCE SYSTEM**

### **Multi-Layer Content Processing**

**Layer 1: Content Extraction**
```typescript
// analyze-content/index.ts
const cleanedHtml = html
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gmi, '')
  .replace(/<div[^>]*class[^>]*["']?[^"']*author[^"']*["']?[^>]*>/gmi, '')
  // Remove author bio sections, ads, navigation
```

**Layer 2: Content Scoring**
```typescript
const scoreContent = (content, selector) => {
  // Penalty for author bio keywords
  // Bonus for main content keywords
  // Length optimization scoring
  // Selector priority weighting
}
```

**Layer 3: AI Processing**
```typescript
// Enhanced prompt for Gemini API
const prompt = `Focus EXCLUSIVELY on main article content.
IGNORE: Author bios, career details, educational background
FOCUS ON: Primary news story, key facts, important details`
```

---

## 💳 **DUAL PAYMENT GATEWAY ARCHITECTURE**

### **Gateway Selection Logic**
```typescript
// Pricing.tsx - Intelligent gateway routing
const handlePayment = (planId) => {
  if (userCountry === 'IN' || preferredCurrency === 'INR') {
    return handleRazorpayPayment(planId);
  } else {
    return handleStripePayment(planId);
  }
};
```

### **Payment Verification Chain**
```
1. Frontend initiates payment
2. Backend creates order/session
3. User completes payment on gateway
4. Gateway sends webhook to backend
5. Backend verifies signature
6. Database subscription updated
7. Real-time UI notification
```

---

## 📈 **ANALYTICS & TRACKING SYSTEM**

### **Event Tracking Pipeline**
```
User Action → Frontend Event → track-analytics Function → Database Storage → Dashboard Display
```

**Tracked Events:**
- FAQ generation (`faq_generated`)
- Collection exports (`export`)
- Widget embeds (`embed_generated`)
- Plan upgrades (`plan_upgraded`)
- Usage resets (`usage_reset`)

### **Analytics Components**
- `src/components/dashboard/DashboardOverviewData.tsx` (Display)
- `supabase/functions/track-analytics/index.ts` (Processing)
- `usage_analytics` table (Storage)
- Real-time aggregation functions

---

## 🔧 **DATABASE FUNCTION INTERACTIONS**

### **Critical Business Logic Functions**

**User Management:**
```sql
handle_new_user() -- Auto-creates profile + Free plan
check_and_reset_user_usage() -- Monthly usage reset
```

**Usage Enforcement:**
```sql
increment_faq_usage_by_count() -- Enforces FAQ limits
track_simple_analytics() -- Records user actions
```

**Analytics:**
```sql
increment_collection_views() -- Widget analytics
increment_faq_views() -- Individual FAQ tracking
```

---

## 🎨 **UI STATE MANAGEMENT**

### **Component State Flow**
```
useAuth.tsx (Global auth state)
    ↓
Dashboard.tsx (Main container)
    ↓
useSubscription.tsx (Subscription data)
    ↓
Individual Components (Local state + global data)
```

### **Real-time Updates**
- **Immediate**: UI updates on user actions
- **Automatic**: Database changes trigger re-renders
- **Consistent**: All components stay synchronized

---

## 🚀 **DEPLOYMENT INTERACTIONS**

### **Edge Function Dependencies**
```
analyze-content → Gemini API + Database
create-razorpay-order → Razorpay API + Database
verify-razorpay-payment → Database + Real-time updates
track-analytics → Database + Aggregation functions
```

### **Environment Configuration**
- Supabase project settings
- API keys (Gemini, Stripe, Razorpay)
- Database connection strings
- OAuth provider configurations

This interaction map provides a complete understanding of how all FAQify components work together to deliver a seamless, real-time user experience with robust business logic enforcement.
