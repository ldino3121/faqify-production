# 🚀 Deploy FAQ Creator Database Functions

## ⚠️ **IMPORTANT: Manual Deployment Required**

The FAQ Creator component requires specific database functions to work properly. These need to be deployed manually using the Supabase SQL Editor.

## 📋 **Step-by-Step Deployment Instructions**

### **Step 1: Open Supabase SQL Editor**
1. Go to: https://supabase.com/dashboard/project/dlzshcshqjdghmtzlbma/sql
2. Make sure you're logged in to your Supabase account

### **Step 2: Copy and Execute the SQL**
Copy the following SQL code and paste it into the SQL Editor, then click **"Run"**:

```sql
-- =====================================================
-- FAQ Creator Database Functions - PERMANENT DEPLOYMENT
-- =====================================================

-- Function 1: Increment FAQ usage by count
CREATE OR REPLACE FUNCTION public.increment_faq_usage_by_count(user_uuid UUID, faq_count INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER;
  usage_limit INTEGER;
  subscription_status TEXT;
BEGIN
  SELECT faq_usage_current, faq_usage_limit, status
  INTO current_usage, usage_limit, subscription_status
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  IF current_usage IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF subscription_status != 'active' THEN
    RETURN FALSE;
  END IF;
  
  IF current_usage + faq_count > usage_limit THEN
    RETURN FALSE;
  END IF;
  
  UPDATE public.user_subscriptions 
  SET 
    faq_usage_current = faq_usage_current + faq_count,
    updated_at = NOW()
  WHERE user_id = user_uuid;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 2: Check if user can generate FAQs
CREATE OR REPLACE FUNCTION public.can_generate_faqs(user_uuid UUID, faq_count INTEGER DEFAULT 1)
RETURNS JSONB AS $$
DECLARE
  subscription_record RECORD;
  result JSONB;
BEGIN
  SELECT 
    plan_tier,
    status,
    faq_usage_current,
    faq_usage_limit
  INTO subscription_record
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  result := jsonb_build_object(
    'can_generate', false,
    'reason', 'No subscription found',
    'current_usage', 0,
    'usage_limit', 0,
    'remaining_faqs', 0,
    'plan_tier', 'Unknown'
  );
  
  IF subscription_record IS NULL THEN
    RETURN result;
  END IF;
  
  result := jsonb_build_object(
    'can_generate', false,
    'reason', 'Unknown error',
    'current_usage', subscription_record.faq_usage_current,
    'usage_limit', subscription_record.faq_usage_limit,
    'remaining_faqs', GREATEST(0, subscription_record.faq_usage_limit - subscription_record.faq_usage_current),
    'plan_tier', subscription_record.plan_tier,
    'status', subscription_record.status
  );
  
  IF subscription_record.status != 'active' THEN
    result := jsonb_set(result, '{reason}', '"Subscription is not active"');
    RETURN result;
  END IF;
  
  IF subscription_record.faq_usage_current + faq_count > subscription_record.faq_usage_limit THEN
    result := jsonb_set(result, '{reason}', '"Monthly FAQ limit exceeded"');
    RETURN result;
  END IF;
  
  result := jsonb_set(result, '{can_generate}', 'true');
  result := jsonb_set(result, '{reason}', '"OK"');
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions for authenticated users
GRANT EXECUTE ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_generate_faqs(UUID, INTEGER) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) IS 'Increment user FAQ usage by specified count with validation';
COMMENT ON FUNCTION public.can_generate_faqs(UUID, INTEGER) IS 'Check if user can generate specified number of FAQs with detailed response';
```

### **Step 3: Verify Deployment**
After running the SQL, you should see a success message. The functions are now deployed!

### **Step 4: Test the FAQ Creator**
1. Go back to your application: http://localhost:8082/dashboard#
2. Click on the "Create FAQ" tab
3. It should now load without errors
4. You can test FAQ generation functionality

## 🔍 **Verification Steps**

### **Option 1: Use the Debug Tool**
1. Open: http://localhost:8082/debug-faq-creator.html
2. Click "Test Database Functions"
3. You should see ✅ green success messages

### **Option 2: Test in Supabase SQL Editor**
Run this test query in the SQL Editor:
```sql
-- Test the functions
SELECT public.can_generate_faqs('00000000-0000-0000-0000-000000000000'::UUID, 1);
```

## ✅ **What These Functions Do**

### **`increment_faq_usage_by_count(user_uuid, faq_count)`**
- ✅ Validates user subscription exists and is active
- ✅ Checks if user has enough remaining quota
- ✅ Increments usage count by specified amount
- ✅ Returns TRUE on success, FALSE on failure

### **`can_generate_faqs(user_uuid, faq_count)`**
- ✅ Returns detailed JSON with generation eligibility
- ✅ Includes current usage, limits, and remaining quota
- ✅ Provides specific reason if generation is not allowed
- ✅ Used for UI validation and user feedback

## 🎯 **Expected Results After Deployment**

✅ **FAQ Creator tab loads without errors**  
✅ **Usage limits display correctly (e.g., 0/5 for Free plan)**  
✅ **FAQ generation works with proper validation**  
✅ **Usage tracking updates the database correctly**  
✅ **Error messages are user-friendly and specific**  
✅ **Subscription status shows accurately**

## 🚨 **Troubleshooting**

### **If functions still don't work:**
1. Check the SQL Editor for any error messages
2. Verify you're logged into the correct Supabase project
3. Make sure the SQL was executed successfully
4. Try refreshing your application

### **If you see permission errors:**
The GRANT statements should handle permissions, but if you still see issues, contact support.

## 📞 **Need Help?**
If you encounter any issues during deployment, the functions are essential for the FAQ Creator to work properly. The deployment must be completed for the component to function correctly.
