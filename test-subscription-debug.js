// SUBSCRIPTION DEBUG SCRIPT
// Run this in browser console on your FAQify dashboard

console.log('🧪 Starting Subscription Debug Test...');

async function debugSubscription() {
  try {
    // Check if we're on the right page
    if (!window.location.href.includes('dashboard')) {
      console.error('❌ Please run this on your FAQify dashboard page');
      return;
    }

    // Check if Supabase is available
    const supabase = window.supabase || window._supabase;
    if (!supabase) {
      console.error('❌ Supabase client not found');
      return;
    }
    console.log('✅ Supabase client found');

    // Check if user is logged in
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('❌ User not logged in:', userError);
      return;
    }
    console.log('✅ User logged in:', user.email);

    // Test 1: Check database plan configuration
    console.log('\n📋 Test 1: Checking database plan configuration...');
    const { data: plans, error: plansError } = await supabase
      .from('subscription_plans')
      .select('name, price_monthly, price_inr, razorpay_plan_id_inr')
      .in('name', ['Pro', 'Business']);

    if (plansError) {
      console.error('❌ Database error:', plansError);
      return;
    }

    console.log('📊 Plans in database:', plans);
    
    const proplan = plans.find(p => p.name === 'Pro');
    const businessPlan = plans.find(p => p.name === 'Business');
    
    if (proplan?.razorpay_plan_id_inr === 'plan_REN5cBATpXrR7S') {
      console.log('✅ Pro plan ID configured correctly');
    } else {
      console.error('❌ Pro plan ID missing or incorrect:', proplan?.razorpay_plan_id_inr);
      console.log('💡 Expected: plan_REN5cBATpXrR7S');
    }

    if (businessPlan?.razorpay_plan_id_inr === 'plan_RENZeCMJQuFc8n') {
      console.log('✅ Business plan ID configured correctly');
    } else {
      console.error('❌ Business plan ID missing or incorrect:', businessPlan?.razorpay_plan_id_inr);
      console.log('💡 Expected: plan_RENZeCMJQuFc8n');
    }

    // Test 2: Test edge function
    console.log('\n🔧 Test 2: Testing subscription edge function...');
    const { data, error } = await supabase.functions.invoke('create-razorpay-subscription', {
      body: {
        planId: 'Pro',
        userEmail: user.email,
        userName: user.user_metadata?.full_name || user.email || 'Test User',
        currency: 'INR',
        userCountry: 'IN'
      }
    });

    console.log('📥 Edge function response:', { data, error });

    if (error) {
      console.error('❌ Edge function error:', error);
      
      // Check for common error patterns
      if (error.message?.includes('credentials not configured')) {
        console.error('🔑 SOLUTION: Set RAZORPAY_KEY_ID and RAZORPAY_SECRET_KEY in Supabase Edge Functions environment variables');
        console.error('⚠️  NOTE: Make sure it\'s RAZORPAY_SECRET_KEY (not RAZORPAY_KEY_SECRET)');
      } else if (error.message?.includes('Plan not found')) {
        console.error('📋 SOLUTION: Run COMPLETE-DATABASE-FIX.sql in Supabase SQL Editor');
      } else if (error.message?.includes('Unauthorized')) {
        console.error('🔐 SOLUTION: Set SUPABASE_SERVICE_ROLE_KEY in Supabase Edge Functions environment variables');
      } else if (error.message?.includes('razorpay_plan_id')) {
        console.error('🔧 SOLUTION: Update edge function to use razorpay_plan_id_inr column');
      }
      return;
    }

    if (data && data.success) {
      console.log('✅ Subscription created successfully!');
      console.log('📋 Subscription ID:', data.subscription_id);
      console.log('💰 Amount:', data.amount);
      console.log('💱 Currency:', data.currency);
      console.log('🔗 Payment URL:', data.short_url);
      
      // Test 3: Check if Razorpay checkout would work
      console.log('\n💳 Test 3: Checking Razorpay integration...');
      if (window.Razorpay) {
        console.log('✅ Razorpay SDK loaded');
        
        // Check if we have the key
        const razorpayKey = import.meta.env?.VITE_RAZORPAY_KEY_ID;
        if (razorpayKey) {
          console.log('✅ Razorpay key configured:', razorpayKey);
          console.log('🎉 SUBSCRIPTION SYSTEM IS READY!');
          console.log('💡 Try clicking "Upgrade to Pro" button now');
        } else {
          console.error('❌ VITE_RAZORPAY_KEY_ID not set in frontend environment');
        }
      } else {
        console.error('❌ Razorpay SDK not loaded');
      }
    } else {
      console.error('❌ Subscription creation failed:', data);
    }

  } catch (error) {
    console.error('❌ Debug test failed:', error);
  }
}

// Run the debug test
debugSubscription();

console.log('\n📋 SUMMARY:');
console.log('1. Check database plan configuration ✓');
console.log('2. Test edge function ✓');
console.log('3. Check Razorpay integration ✓');
console.log('\nIf all tests pass, your subscription system should work!');
