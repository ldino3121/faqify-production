# 📊 Database Analysis & Cleanup Report

## 🔍 Current Database State Analysis

### ✅ **Core Tables (KEEP - All in Active Use)**

#### 1. **`profiles`** - User Profile Data
- **Status**: ✅ ACTIVE - Used throughout app
- **Usage**: User authentication, profile management
- **References**: 
  - `useAuth.tsx` - User profile creation
  - `DashboardHeader.tsx` - User display
  - All user-related operations

#### 2. **`subscription_plans`** - Plan Definitions
- **Status**: ✅ ACTIVE - Core business logic
- **Usage**: Pricing display, plan management
- **References**:
  - `PlanUpgradeData.tsx` - Plan display
  - `useSubscription.tsx` - Plan validation
  - `usePricingMigration.tsx` - Plan updates

#### 3. **`user_subscriptions`** - User Plan & Usage Tracking
- **Status**: ✅ ACTIVE - Critical for business logic
- **Usage**: FAQ limits, usage tracking, billing
- **References**:
  - `useSubscription.tsx` - Real-time usage tracking
  - `DashboardHeader.tsx` - Usage display
  - `FAQCreator.tsx` - Limit enforcement

#### 4. **`faq_collections`** - FAQ Collections
- **Status**: ✅ ACTIVE - Core functionality
- **Usage**: FAQ organization, embedding
- **References**:
  - `DashboardOverviewData.tsx` - Collection display
  - `export-faqs` function - Export functionality
  - `get-faq-widget` function - Widget generation

#### 5. **`faqs`** - Individual FAQ Items
- **Status**: ✅ ACTIVE - Core functionality
- **Usage**: FAQ content storage
- **References**:
  - All FAQ-related components
  - Export and widget functions
  - Analytics tracking

### ⚠️ **Analytics Tables (INCONSISTENT - Needs Review)**

#### 6. **`usage_analytics`** - Basic Usage Tracking
- **Status**: ⚠️ PARTIALLY USED - Simple analytics
- **Usage**: Basic action tracking
- **Issues**: Limited functionality, overlaps with analytics_events

#### 7. **`analytics_events`** - Detailed Event Tracking
- **Status**: ⚠️ REFERENCED BUT TABLES NOT CREATED
- **Usage**: Advanced analytics (views, clicks, widget loads)
- **Issues**: 
  - Referenced in `get-analytics` function
  - Referenced in `track-analytics` function
  - **BUT TABLE NOT CREATED IN MIGRATIONS**

#### 8. **`collection_analytics`** - Collection-Level Analytics
- **Status**: ❌ REFERENCED BUT NOT CREATED
- **Usage**: Collection view/click tracking
- **Issues**: Referenced in functions but table doesn't exist

#### 9. **`faq_analytics`** - FAQ-Level Analytics
- **Status**: ❌ REFERENCED BUT NOT CREATED
- **Usage**: Individual FAQ tracking
- **Issues**: Referenced in functions but table doesn't exist

#### 10. **`user_analytics`** - User-Level Analytics
- **Status**: ❌ REFERENCED BUT NOT CREATED
- **Usage**: User export/embed tracking
- **Issues**: Referenced in functions but table doesn't exist

## 🚨 **Critical Issues Identified**

### 1. **Migration Conflicts**
- **Issue**: Multiple conflicting migrations for pricing
- **Files**: 
  - `20250106000000_update_pricing_plans.sql` (Free: 10 FAQs)
  - `20250107000000_update_pricing_to_new_structure.sql` (Free: 5 FAQs)
- **Impact**: User accounts have inconsistent limits

### 2. **Missing Analytics Tables**
- **Issue**: Functions reference tables that don't exist
- **Impact**: Analytics features will fail
- **Functions Affected**:
  - `track-analytics` function
  - `get-analytics` function

### 3. **Orphaned Database Functions**
- **Issue**: Functions for non-existent tables
- **Functions**:
  - `increment_collection_views()`
  - `increment_faq_views()`
  - `increment_widget_loads()`
  - `increment_user_exports()`
  - `increment_user_embeds()`

## 🎯 **Recommended Actions**

### **Phase 1: Fix Critical Issues (IMMEDIATE)**

#### A. **Resolve Pricing Migration Conflicts**
1. Apply final pricing structure (Free: 5, Pro: 100, Business: 500)
2. Update all existing user accounts to correct limits
3. Remove conflicting migration artifacts

#### B. **Fix Analytics System**
**Option 1: Complete Analytics Implementation**
- Create missing analytics tables
- Deploy analytics functions
- Enable full analytics features

**Option 2: Simplify Analytics (RECOMMENDED)**
- Keep only `usage_analytics` table
- Remove references to complex analytics
- Simplify analytics to basic usage tracking

### **Phase 2: Database Cleanup (AFTER PHASE 1)**

#### A. **Tables to Keep (Core Functionality)**
```sql
✅ profiles
✅ subscription_plans  
✅ user_subscriptions
✅ faq_collections
✅ faqs
✅ usage_analytics (simplified)
```

#### B. **Tables/Functions to Remove**
```sql
❌ analytics_events (if not implementing full analytics)
❌ collection_analytics (if not implementing)
❌ faq_analytics (if not implementing)  
❌ user_analytics (if not implementing)
❌ increment_collection_views() function
❌ increment_faq_views() function
❌ increment_widget_loads() function
❌ increment_user_exports() function
❌ increment_user_embeds() function
```

#### C. **Migration Files to Clean**
```
❌ 20250106000000_update_pricing_plans.sql (conflicting)
✅ 20250107000000_update_pricing_to_new_structure.sql (keep)
✅ 20250629083932-*.sql (main schema)
```

## 🔄 **Implementation Plan**

### **Step 1: Immediate Fixes**
1. Run pricing migration to fix user limits
2. Update user accounts to correct Free plan (5 FAQs)
3. Verify all users have proper subscription records

### **Step 2: Analytics Decision**
**Choose One:**
- **Simple**: Keep basic `usage_analytics`, remove complex analytics
- **Full**: Implement all analytics tables and functions

### **Step 3: Cleanup**
1. Remove conflicting migration files
2. Remove unused database functions
3. Clean up orphaned references in code

### **Step 4: Verification**
1. Test all core functionality
2. Verify user limits work correctly
3. Ensure no broken references

## 🛡️ **Safety Measures**

### **Before Any Changes:**
1. ✅ Backup current database
2. ✅ Test changes in development first
3. ✅ Verify all functionality works
4. ✅ Have rollback plan ready

### **During Changes:**
1. ✅ Make changes incrementally
2. ✅ Test after each change
3. ✅ Monitor for errors
4. ✅ Keep detailed logs

## 📋 **Next Steps**

1. **Review this analysis** with stakeholders
2. **Choose analytics approach** (simple vs full)
3. **Execute Phase 1 fixes** (pricing migration)
4. **Plan Phase 2 cleanup** based on analytics decision
5. **Schedule maintenance window** for cleanup

---

**⚠️ CRITICAL**: Do not remove any tables or functions until Phase 1 is complete and verified working.
