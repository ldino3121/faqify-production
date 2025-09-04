// Direct SQL update to assign Pro plan
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dlzshcshqjdghmtzlbma.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsenNoY3NocWpkZ2htdHpsYm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODUzODgsImV4cCI6MjA2Njc2MTM4OH0.EL4By0nom419JiorSHKiFckLqnh1sqmFvYnWTylB9Gk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function assignProPlan() {
    console.log('🚀 Running direct SQL update for Pro plan assignment...');
    
    try {
        // Use RPC to run SQL directly
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: `
                -- Find user ID for faqify18@gmail.com
                WITH user_info AS (
                    SELECT id FROM auth.users WHERE email = 'faqify18@gmail.com'
                )
                -- Update or insert subscription
                INSERT INTO public.user_subscriptions (
                    user_id, 
                    plan_tier, 
                    faq_usage_limit, 
                    faq_usage_current, 
                    status,
                    plan_activated_at,
                    plan_expires_at,
                    last_reset_date,
                    updated_at
                )
                SELECT 
                    ui.id,
                    'Pro'::plan_tier,
                    100,
                    0,
                    'active'::subscription_status,
                    NOW(),
                    NOW() + INTERVAL '30 days',
                    CURRENT_DATE,
                    NOW()
                FROM user_info ui
                ON CONFLICT (user_id) 
                DO UPDATE SET
                    plan_tier = 'Pro'::plan_tier,
                    faq_usage_limit = 100,
                    faq_usage_current = 0,
                    status = 'active'::subscription_status,
                    plan_activated_at = NOW(),
                    plan_expires_at = NOW() + INTERVAL '30 days',
                    updated_at = NOW()
                RETURNING plan_tier, faq_usage_current, faq_usage_limit, status;
            `
        });

        if (error) {
            console.error('❌ SQL Error:', error);
        } else {
            console.log('✅ Pro plan assigned successfully!');
            console.log('📊 Result:', data);
            console.log('\n🔄 Please refresh your dashboard to see the Pro plan!');
        }
        
    } catch (error) {
        console.error('❌ Exception:', error.message);
    }
}

// Run the assignment
assignProPlan();
