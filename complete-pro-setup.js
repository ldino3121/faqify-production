// Complete Pro plan setup - creates profile and subscription for faqify18@gmail.com
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dlzshcshqjdghmtzlbma.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsenNoY3NocWpkZ2htdHpsYm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODUzODgsImV4cCI6MjA2Njc2MTM4OH0.EL4By0nom419JiorSHKiFckLqnh1sqmFvYnWTylB9Gk';

const supabase = createClient(supabaseUrl, supabaseKey);

// Generate a UUID for the user (since we need to create the profile)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function createCompleteProUser() {
    console.log('🚀 Creating complete Pro user setup for faqify18@gmail.com...\n');
    
    const userId = generateUUID();
    const email = 'faqify18@gmail.com';
    
    try {
        // Step 1: Create profile
        console.log('📝 Step 1: Creating user profile...');
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: userId,
                email: email,
                full_name: 'FAQify Pro User',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select();

        if (profileError) {
            console.error('❌ Profile creation failed:', profileError);
            return false;
        }
        
        console.log('✅ Profile created:', profileData[0]);

        // Step 2: Create Pro subscription
        console.log('\n💎 Step 2: Creating Pro subscription...');
        const { data: subscriptionData, error: subscriptionError } = await supabase
            .from('user_subscriptions')
            .insert({
                user_id: userId,
                plan_tier: 'Pro',
                faq_usage_limit: 100,
                faq_usage_current: 0,
                status: 'active',
                plan_activated_at: new Date().toISOString(),
                plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                last_reset_date: new Date().toISOString().split('T')[0],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select();

        if (subscriptionError) {
            console.error('❌ Subscription creation failed:', subscriptionError);
            return false;
        }
        
        console.log('✅ Pro subscription created:', subscriptionData[0]);

        // Step 3: Verify everything
        console.log('\n🔍 Step 3: Verifying setup...');
        const { data: verifyData, error: verifyError } = await supabase
            .from('user_subscriptions')
            .select(`
                *,
                profiles (email, full_name)
            `)
            .eq('user_id', userId)
            .single();

        if (verifyError) {
            console.error('❌ Verification failed:', verifyError);
            return false;
        }

        console.log('✅ Verification successful:');
        console.log('📧 Email:', verifyData.profiles.email);
        console.log('👤 Name:', verifyData.profiles.full_name);
        console.log('💎 Plan:', verifyData.plan_tier);
        console.log('📊 Usage:', `${verifyData.faq_usage_current}/${verifyData.faq_usage_limit}`);
        console.log('✅ Status:', verifyData.status);

        console.log('\n🎉 SUCCESS! Complete Pro user setup completed!');
        console.log(`🆔 User ID: ${userId}`);
        console.log('📧 Email: faqify18@gmail.com');
        console.log('💎 Plan: Pro (100 FAQs/month)');
        
        console.log('\n📋 IMPORTANT: Save this User ID for login:');
        console.log(`User ID: ${userId}`);
        
        return true;
        
    } catch (error) {
        console.error('❌ Exception:', error.message);
        return false;
    }
}

// Run the complete setup
createCompleteProUser();
