import { createClient } from '@supabase/supabase-js';


const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role key needed for admin operations

if (!supabaseUrl || !supabaseServiceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
if (!process.argv.includes('--allow-legacy-schema-write')) throw new Error('Legacy schema writer: review against the Paddle migration before explicitly allowing execution.');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deployFunctions() {
  console.log('🚀 Deploying FAQ Creator Database Functions...\n');

  try {
    // Function 1: can_generate_faqs
    console.log('📝 Creating can_generate_faqs function...');
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });

    if (error1) {
      console.log('❌ Error creating can_generate_faqs:', error1.message);
    } else {
      console.log('✅ can_generate_faqs function created successfully');
    }

    // Function 2: increment_faq_usage_by_count
    console.log('📝 Creating increment_faq_usage_by_count function...');
    const { error: error2 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION public.increment_faq_usage_by_count(user_uuid UUID, faq_count INTEGER)
        RETURNS BOOLEAN AS $$
        DECLARE
          current_usage INTEGER;
          usage_limit INTEGER;
        BEGIN
          SELECT faq_usage_current, faq_usage_limit 
          INTO current_usage, usage_limit
          FROM public.user_subscriptions 
          WHERE user_id = user_uuid;
          
          IF current_usage + faq_count > usage_limit THEN
            RETURN FALSE;
          END IF;
          
          UPDATE public.user_subscriptions 
          SET faq_usage_current = faq_usage_current + faq_count,
              updated_at = NOW()
          WHERE user_id = user_uuid;
          
          RETURN TRUE;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `
    });

    if (error2) {
      console.log('❌ Error creating increment_faq_usage_by_count:', error2.message);
    } else {
      console.log('✅ increment_faq_usage_by_count function created successfully');
    }

    console.log('\n🎉 Database functions deployment completed!');
    console.log('✅ FAQ Creator should now work properly');

  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
  }
}

// Alternative approach using direct SQL execution
async function deployFunctionsDirectly() {
  console.log('🚀 Deploying functions using direct SQL execution...\n');

  const functions = [
    {
      name: 'increment_faq_usage_by_count',
      sql: `
        CREATE OR REPLACE FUNCTION public.increment_faq_usage_by_count(user_uuid UUID, faq_count INTEGER)
        RETURNS BOOLEAN AS $$
        DECLARE
          current_usage INTEGER;
          usage_limit INTEGER;
        BEGIN
          SELECT faq_usage_current, faq_usage_limit 
          INTO current_usage, usage_limit
          FROM public.user_subscriptions 
          WHERE user_id = user_uuid;
          
          IF current_usage IS NULL THEN
            RETURN FALSE;
          END IF;
          
          IF current_usage + faq_count > usage_limit THEN
            RETURN FALSE;
          END IF;
          
          UPDATE public.user_subscriptions 
          SET faq_usage_current = faq_usage_current + faq_count,
              updated_at = NOW()
          WHERE user_id = user_uuid;
          
          RETURN TRUE;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `
    }
  ];

  for (const func of functions) {
    try {
      console.log(`📝 Creating ${func.name} function...`);
      
      // Use the SQL editor approach
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({ sql: func.sql })
      });

      if (response.ok) {
        console.log(`✅ ${func.name} function created successfully`);
      } else {
        const error = await response.text();
        console.log(`❌ Error creating ${func.name}:`, error);
      }
    } catch (err) {
      console.log(`❌ Exception creating ${func.name}:`, err.message);
    }
  }

  console.log('\n🎉 Direct deployment completed!');
}

// Run the deployment
deployFunctionsDirectly().catch(console.error);
