// Test script to check if create-razorpay-subscription edge function is working
// Run this in browser console on your FAQify dashboard

async function testSubscriptionCreation() {
  console.log('🧪 Testing Razorpay Subscription Creation...');
  
  try {
    // Get Supabase client from window (should be available in dashboard)
    const supabase = window.supabase || window._supabase;
    
    if (!supabase) {
      console.error('❌ Supabase client not found. Make sure you\'re on the dashboard page.');
      return;
    }
    
    console.log('✅ Supabase client found');
    
    // Test the edge function
    const { data, error } = await supabase.functions.invoke('create-razorpay-subscription', {
      body: {
        planId: 'Pro',
        userEmail: 'test@example.com',
        userName: 'Test User',
        currency: 'INR',
        userCountry: 'IN'
      }
    });
    
    console.log('📊 Edge Function Response:', { data, error });
    
    if (error) {
      console.error('❌ Edge Function Error:', error);
      return;
    }
    
    if (data && data.success) {
      console.log('✅ Subscription created successfully!');
      console.log('📋 Subscription ID:', data.subscription_id);
      console.log('💰 Plan ID used:', data.plan_id);
    } else {
      console.error('❌ Subscription creation failed:', data);
    }
    
  } catch (err) {
    console.error('❌ Test failed with error:', err);
  }
}

// Run the test
testSubscriptionCreation();
