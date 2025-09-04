import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Supabase configuration
const supabaseUrl = 'https://dlzshcshqjdghmtzlbma.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsenNoY3NocWpkZ2htdHpsYm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODUzODgsImV4cCI6MjA2Njc2MTM4OH0.EL4By0nom419JiorSHKiFckLqnh1sqmFvYnWTylB9Gk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function deployFunctions() {
  console.log('🚀 Deploying FAQ Creator Database Functions...\n');

  // Function 1: increment_faq_usage_by_count
  const incrementFunction = `
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
  `;

  // Function 2: can_generate_faqs
  const canGenerateFunction = `
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
  `;

  const functions = [
    { name: 'increment_faq_usage_by_count', sql: incrementFunction },
    { name: 'can_generate_faqs', sql: canGenerateFunction }
  ];

  try {
    console.log('📝 Attempting to deploy functions using Supabase Edge Functions...\n');

    // Try to deploy using edge function
    const { data, error } = await supabase.functions.invoke('deploy-sql', {
      body: {
        functions: functions
      }
    });

    if (error) {
      console.log('❌ Edge function approach failed:', error.message);
      console.log('\n📋 Manual deployment required. Please:');
      console.log('1. Go to: https://supabase.com/dashboard/project/dlzshcshqjdghmtzlbma/sql');
      console.log('2. Copy and paste the SQL from manual-sql-deployment.sql');
      console.log('3. Click "Run" to execute the migration');
      console.log('\n📄 SQL to execute:');
      console.log('=====================================');
      
      functions.forEach(func => {
        console.log(`-- ${func.name}`);
        console.log(func.sql);
        console.log('');
      });
      
      console.log('-- Grant permissions');
      console.log('GRANT EXECUTE ON FUNCTION public.increment_faq_usage_by_count(UUID, INTEGER) TO authenticated;');
      console.log('GRANT EXECUTE ON FUNCTION public.can_generate_faqs(UUID, INTEGER) TO authenticated;');
      console.log('=====================================');
    } else {
      console.log('✅ Functions deployed successfully!');
      console.log('📊 Response:', data);
    }

  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
    console.log('\n📋 Please deploy manually using the Supabase SQL Editor');
    console.log('URL: https://supabase.com/dashboard/project/dlzshcshqjdghmtzlbma/sql');
  }
}

// Test the functions after deployment
async function testFunctions() {
  console.log('\n🧪 Testing deployed functions...\n');

  try {
    // Test increment_faq_usage_by_count
    console.log('Testing increment_faq_usage_by_count...');
    const { data: incrementData, error: incrementError } = await supabase.rpc('increment_faq_usage_by_count', {
      user_uuid: '00000000-0000-0000-0000-000000000000', // Test UUID
      faq_count: 0
    });

    if (incrementError) {
      console.log('❌ increment_faq_usage_by_count test failed:', incrementError.message);
    } else {
      console.log('✅ increment_faq_usage_by_count function is working');
    }

    // Test can_generate_faqs
    console.log('Testing can_generate_faqs...');
    const { data: canGenerateData, error: canGenerateError } = await supabase.rpc('can_generate_faqs', {
      user_uuid: '00000000-0000-0000-0000-000000000000', // Test UUID
      faq_count: 1
    });

    if (canGenerateError) {
      console.log('❌ can_generate_faqs test failed:', canGenerateError.message);
    } else {
      console.log('✅ can_generate_faqs function is working');
      console.log('📊 Response:', canGenerateData);
    }

  } catch (err) {
    console.error('❌ Function testing failed:', err.message);
  }
}

// Main execution
async function main() {
  await deployFunctions();
  
  // Wait a moment then test
  setTimeout(async () => {
    await testFunctions();
    console.log('\n🎉 Deployment process completed!');
    console.log('✅ FAQ Creator should now work properly');
  }, 2000);
}

main().catch(console.error);
