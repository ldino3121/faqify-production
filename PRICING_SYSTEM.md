# 🎯 Real-Time Pricing System Documentation

## 📋 Overview

The FAQify pricing system is designed to be fully real-time with automatic synchronization between database, backend logic, and frontend components.

## 💰 Pricing Structure

| Plan | Price | FAQ Limit | Features |
|------|-------|-----------|----------|
| **Free** | $0/month | 5 FAQs | All core features |
| **Pro** | $9/month | 100 FAQs | All core features + Priority support |
| **Business** | $29/month | 500 FAQs | All core features + Phone support |

### 🔄 Key Features:
- **Same features across all plans** - Only FAQ limits differ
- **Monthly usage reset** - Limits reset every month
- **Real-time enforcement** - Usage limits enforced immediately
- **Automatic plan assignment** - New users get Free plan automatically

## 🏗️ System Architecture

### 1. **Database Layer**
- `subscription_plans` table stores plan definitions
- `user_subscriptions` table tracks user plans and usage
- Database functions handle usage tracking and monthly resets
- Real-time triggers notify frontend of changes

### 2. **Backend Logic**
- `increment_faq_usage_by_count()` - Enforces FAQ limits
- `check_and_reset_user_usage()` - Monthly usage reset
- `handle_new_user()` - Auto-assigns Free plan to new users
- Stripe integration for plan upgrades

### 3. **Frontend Components**
- `useSubscription` hook - Real-time subscription data
- `usePricingMigration` hook - Auto-applies pricing updates
- Real-time PostgreSQL change listeners
- Automatic UI updates when plans change

## 🔄 Real-Time Synchronization

### **User Signup Flow:**
1. User creates account
2. `handle_new_user()` trigger fires
3. Creates profile and assigns Free plan (5 FAQs)
4. Frontend receives real-time update
5. Dashboard shows current usage immediately

### **Plan Upgrade Flow:**
1. User clicks upgrade button
2. Stripe checkout session created
3. Payment processed
4. Webhook updates user subscription
5. Real-time listener updates frontend
6. New limits enforced immediately

### **Usage Tracking Flow:**
1. User generates FAQs
2. `increment_faq_usage_by_count()` called
3. Checks current usage vs limit
4. Updates usage count if within limit
5. Real-time update to dashboard
6. UI reflects new usage immediately

## 📁 File Structure

```
src/
├── hooks/
│   ├── useSubscription.tsx      # Real-time subscription data
│   ├── usePricingMigration.tsx  # Auto-migration system
│   └── useAuth.tsx              # Authentication
├── components/
│   ├── sections/
│   │   ├── Pricing.tsx          # Landing page pricing
│   │   └── Hero.tsx             # Free plan messaging
│   └── dashboard/
│       ├── DashboardOverviewData.tsx  # Real-time usage display
│       └── PlanUpgradeData.tsx         # Upgrade interface
supabase/
├── migrations/
│   ├── 20250629083932-*.sql     # Initial schema with correct values
│   └── 20250107000000-*.sql     # Pricing update migration
└── functions/
    └── apply-pricing-migration/ # Auto-migration function
```

## 🛠️ Implementation Details

### **Database Functions:**

```sql
-- Check and reset monthly usage
check_and_reset_user_usage(user_uuid UUID)

-- Increment FAQ usage with limit checking
increment_faq_usage_by_count(user_uuid UUID, faq_count INTEGER)

-- Handle new user signup
handle_new_user() TRIGGER
```

### **Real-Time Hooks:**

```typescript
// Subscription hook with real-time updates
const { subscription, loading, canCreateFAQ, getRemainingFAQs } = useSubscription();

// Auto-migration on app startup
usePricingMigration(); // Runs automatically in App.tsx
```

### **Usage Enforcement:**

```typescript
// Before FAQ generation
if (!canGenerateFAQCount(faqs.length)) {
  // Show upgrade prompt
  return;
}

// After successful generation
await supabase.rpc('increment_faq_usage_by_count', {
  user_uuid: user.id,
  faq_count: faqs.length
});
```

## 🚀 Deployment & Migration

### **Automatic Migration:**
- `usePricingMigration` hook runs on app startup
- Checks current pricing structure
- Applies updates if needed
- No user intervention required

### **Manual Migration (if needed):**
Run `manual-pricing-update.sql` in Supabase SQL Editor

### **Verification:**
1. Check landing page shows: Free (5), Pro (100), Business (500)
2. New user signup creates Free plan with 5 FAQs
3. Dashboard shows real-time usage updates
4. Plan upgrades work immediately
5. FAQ generation respects limits

## 🔍 Monitoring & Debugging

### **Check Current State:**
```sql
-- View current plans
SELECT name, faq_limit FROM subscription_plans ORDER BY faq_limit;

-- View user subscriptions
SELECT plan_tier, COUNT(*) as users, faq_usage_limit 
FROM user_subscriptions 
GROUP BY plan_tier, faq_usage_limit;
```

### **Common Issues:**
- **Old limits showing:** Clear browser cache, check database values
- **Real-time not working:** Check PostgreSQL change listeners
- **New users wrong limit:** Verify `handle_new_user()` function

## ✅ Success Criteria

The system is working correctly when:
- ✅ Landing page shows correct limits (5, 100, 500)
- ✅ New users get 5 FAQs automatically
- ✅ Dashboard shows real-time usage updates
- ✅ Plan upgrades reflect immediately
- ✅ FAQ generation enforces limits properly
- ✅ Monthly usage resets work
- ✅ All features available on all plans
