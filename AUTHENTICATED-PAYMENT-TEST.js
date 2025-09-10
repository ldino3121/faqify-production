// AUTHENTICATED PAYMENT SYSTEM TEST
// Run this in your FAQify dashboard browser console (after logging in)

console.log('🧪 Starting Authenticated Payment System Test...');

async function testPaymentSystems() {
  try {
    // Check if we're authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('❌ Not authenticated. Please log in to your dashboard first.');
      return;
    }
    
    console.log(`✅ Authenticated as: ${user.email}`);
    console.log('🔍 Testing both payment systems...\n');

    // Test 1: Subscription System
    console.log('📋 TEST 1: SUBSCRIPTION SYSTEM (create-razorpay-subscription)');
    console.log('=' .repeat(60));
    
    try {
      const subscriptionTest = await supabase.functions.invoke('create-razorpay-subscription', {
        body: {
          planId: 'Pro',
          userEmail: user.email,
          userName: user.user_metadata?.full_name || user.email || 'Test User',
          currency: 'INR',
          userCountry: 'IN'
        }
      });

      console.log('📥 Subscription System Response:');
      console.log('  Success:', subscriptionTest.data?.success);
      console.log('  Error:', subscriptionTest.error?.message);
      
      if (subscriptionTest.data?.success) {
        console.log('✅ SUBSCRIPTION SYSTEM WORKING!');
        console.log(`  - Type: SUBSCRIPTION (auto-renewal)`);
        console.log(`  - Subscription ID: ${subscriptionTest.data.subscription_id}`);
        console.log(`  - Amount: ₹${subscriptionTest.data.amount/100}`);
        console.log(`  - Currency: ${subscriptionTest.data.currency}`);
        console.log(`  - Status: ${subscriptionTest.data.status}`);
        console.log(`  - Payment URL: ${subscriptionTest.data.short_url}`);
        console.log(`  - Next Billing: ${subscriptionTest.data.billing_details?.next_billing}`);
      } else {
        console.log('❌ SUBSCRIPTION SYSTEM FAILED');
        console.log(`  - Error: ${subscriptionTest.data?.error || subscriptionTest.error?.message}`);
      }
      
    } catch (error) {
      console.log('❌ SUBSCRIPTION SYSTEM ERROR:', error.message);
    }

    console.log('\n' + '=' .repeat(60));

    // Test 2: One-Time System
    console.log('📋 TEST 2: ONE-TIME SYSTEM (create-razorpay-order)');
    console.log('=' .repeat(60));
    
    try {
      const orderTest = await supabase.functions.invoke('create-razorpay-order', {
        body: {
          planId: 'Pro',
          currency: 'INR',
          userCountry: 'IN'
        }
      });

      console.log('📥 One-Time System Response:');
      console.log('  Success:', orderTest.data?.success);
      console.log('  Error:', orderTest.error?.message);
      
      if (orderTest.data?.success) {
        console.log('✅ ONE-TIME SYSTEM WORKING!');
        console.log(`  - Type: ONE-TIME (manual renewal)`);
        console.log(`  - Order ID: ${orderTest.data.order?.id}`);
        console.log(`  - Amount: ₹${orderTest.data.order?.amount/100}`);
        console.log(`  - Currency: ${orderTest.data.order?.currency}`);
        console.log(`  - Key: ${orderTest.data.order?.key}`);
      } else {
        console.log('❌ ONE-TIME SYSTEM FAILED');
        console.log(`  - Error: ${orderTest.data?.error || orderTest.error?.message}`);
      }
      
    } catch (error) {
      console.log('❌ ONE-TIME SYSTEM ERROR:', error.message);
    }

    console.log('\n' + '=' .repeat(60));
    console.log('🎯 ANALYSIS COMPLETE!');
    console.log('=' .repeat(60));

    // Analysis
    console.log('\n📊 COMPARISON:');
    console.log('- Subscription system returns: subscription_id, auto-renewal enabled');
    console.log('- One-time system returns: order_id, no auto-renewal');
    console.log('\n💡 NEXT STEPS:');
    console.log('1. Check which system is working');
    console.log('2. Test the "Upgrade to Pro" button in your dashboard');
    console.log('3. See which response format you get');
    console.log('4. Compare with the test results above');

    // Check current dashboard configuration
    console.log('\n🔧 DASHBOARD CONFIGURATION CHECK:');
    
    // Check if we can access the payment type function
    if (window.location.href.includes('dashboard')) {
      console.log('✅ Running on dashboard page');
      console.log('💡 Try clicking "Upgrade to Pro" and check browser console for logs');
      console.log('💡 Look for: "Payment Type: subscription | Country: IN | Plan: Pro"');
    } else {
      console.log('⚠️  Not on dashboard page. Navigate to dashboard and run this test again.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Auto-run the test
testPaymentSystems();

// Also provide manual functions
window.testSubscriptionSystem = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('❌ Please log in first');
    return;
  }
  
  const result = await supabase.functions.invoke('create-razorpay-subscription', {
    body: {
      planId: 'Pro',
      userEmail: user.email,
      userName: user.user_metadata?.full_name || user.email || 'Test User',
      currency: 'INR',
      userCountry: 'IN'
    }
  });
  
  console.log('🔄 Subscription Test Result:', result);
  return result;
};

window.testOneTimeSystem = async () => {
  const result = await supabase.functions.invoke('create-razorpay-order', {
    body: {
      planId: 'Pro',
      currency: 'INR',
      userCountry: 'IN'
    }
  });
  
  console.log('💰 One-Time Test Result:', result);
  return result;
};

console.log('\n🎮 MANUAL TESTING FUNCTIONS AVAILABLE:');
console.log('- testSubscriptionSystem() - Test subscription system');
console.log('- testOneTimeSystem() - Test one-time system');
console.log('\nRun these functions individually if needed.');
