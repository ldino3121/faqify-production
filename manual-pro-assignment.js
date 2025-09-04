// Manual Pro plan assignment using Supabase client
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dlzshcshqjdghmtzlbma.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsenNoY3NocWpkZ2htdHpsYm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODUzODgsImV4cCI6MjA2Njc2MTM4OH0.EL4By0nom419JiorSHKiFckLqnh1sqmFvYnWTylB9Gk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findUserByEmail() {
    console.log('🔍 Finding user with email faqify18@gmail.com...');
    
    try {
        // Get all profiles to find the user
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', 'faqify18@gmail.com');

        if (error) {
            console.error('❌ Error finding user:', error);
            return null;
        }

        if (profiles && profiles.length > 0) {
            console.log('✅ Found user:', profiles[0]);
            return profiles[0];
        } else {
            console.log('❌ No user found with email faqify18@gmail.com');
            return null;
        }
        
    } catch (error) {
        console.error('❌ Exception:', error.message);
        return null;
    }
}

async function updateUserToPro(userId) {
    console.log(`🚀 Updating user ${userId} to Pro plan...`);
    
    try {
        // First, try to update existing subscription
        const { data: updateData, error: updateError } = await supabase
            .from('user_subscriptions')
            .update({
                plan_tier: 'Pro',
                faq_usage_limit: 100,
                faq_usage_current: 0,
                status: 'active',
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .select();

        if (updateError) {
            console.log('⚠️ Update failed, trying insert:', updateError.message);
            
            // If update fails, try insert
            const { data: insertData, error: insertError } = await supabase
                .from('user_subscriptions')
                .insert({
                    user_id: userId,
                    plan_tier: 'Pro',
                    faq_usage_limit: 100,
                    faq_usage_current: 0,
                    status: 'active',
                    last_reset_date: new Date().toISOString().split('T')[0]
                })
                .select();

            if (insertError) {
                console.error('❌ Insert also failed:', insertError);
                return false;
            } else {
                console.log('✅ Pro subscription created:', insertData);
                return true;
            }
        } else {
            console.log('✅ Pro subscription updated:', updateData);
            return true;
        }
        
    } catch (error) {
        console.error('❌ Exception:', error.message);
        return false;
    }
}

async function verifyProAssignment(userId) {
    console.log(`🔍 Verifying Pro plan assignment for user ${userId}...`);
    
    try {
        const { data, error } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error('❌ Verification failed:', error);
            return false;
        }

        console.log('📊 Current subscription:', data);
        
        if (data.plan_tier === 'Pro' && data.faq_usage_limit === 100) {
            console.log('✅ Pro plan assignment verified successfully!');
            return true;
        } else {
            console.log('❌ Pro plan assignment not correct');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Exception:', error.message);
        return false;
    }
}

async function assignProPlan() {
    console.log('🚀 Starting Pro plan assignment process...\n');
    
    // Step 1: Find user
    const user = await findUserByEmail();
    if (!user) {
        console.log('❌ Cannot proceed without finding the user');
        return;
    }

    // Step 2: Update to Pro
    const updateSuccess = await updateUserToPro(user.id);
    if (!updateSuccess) {
        console.log('❌ Failed to update user to Pro plan');
        return;
    }

    // Step 3: Verify
    const verifySuccess = await verifyProAssignment(user.id);
    if (verifySuccess) {
        console.log('\n🎉 SUCCESS! Pro plan has been assigned to faqify18@gmail.com');
        console.log('🔄 Please refresh your dashboard to see the changes!');
    } else {
        console.log('\n❌ FAILED! Pro plan assignment could not be verified');
    }
}

// Run the assignment
assignProPlan();
