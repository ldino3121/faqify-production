// DASHBOARD TOGGLE TEST
// Copy and paste this into your browser console at http://localhost:8082/dashboard

console.log('🎯 Testing Dashboard Payment Toggle');

async function testDashboardToggle() {
  try {
    // Check if we're on dashboard
    if (!window.location.href.includes('dashboard')) {
      console.error('❌ Please navigate to http://localhost:8082/dashboard');
      return;
    }

    // Check authentication
    if (typeof supabase === 'undefined') {
      console.error('❌ Supabase not available. Make sure you\'re on the dashboard page.');
      return;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('❌ Please log in to your dashboard first');
      return;
    }

    console.log(`✅ Authenticated as: ${user.email}`);

    // Look for payment toggle buttons
    console.log('\n🔍 Scanning for payment toggle buttons...');
    
    const allButtons = document.querySelectorAll('button');
    const toggleButtons = [];
    const upgradeButtons = [];
    
    allButtons.forEach((button, index) => {
      const text = button.textContent?.toLowerCase() || '';
      
      if (text.includes('auto-renewal') || text.includes('subscription') || text.includes('one-time')) {
        toggleButtons.push({ element: button, text: button.textContent, index });
      }
      
      if (text.includes('upgrade') || text.includes('choose pro') || text.includes('choose business')) {
        upgradeButtons.push({ element: button, text: button.textContent, index });
      }
    });

    // Report findings
    console.log(`📊 Found ${toggleButtons.length} payment toggle buttons:`);
    toggleButtons.forEach((btn, i) => {
      console.log(`  ${i + 1}. "${btn.text}"`);
    });

    console.log(`📊 Found ${upgradeButtons.length} upgrade buttons:`);
    upgradeButtons.forEach((btn, i) => {
      console.log(`  ${i + 1}. "${btn.text}"`);
    });

    // Test payment systems directly
    console.log('\n🧪 Testing payment systems directly...');

    // Test 1: Subscription System
    console.log('\n🔄 Testing Subscription System...');
    try {
      const subResult = await supabase.functions.invoke('create-razorpay-subscription', {
        body: {
          planId: 'Pro',
          userEmail: user.email,
          userName: user.user_metadata?.full_name || user.email || 'Test User',
          currency: 'INR',
          userCountry: 'IN'
        }
      });

      if (subResult.error) {
        console.log(`❌ Subscription Error: ${subResult.error.message}`);
      } else if (subResult.data?.success) {
        console.log(`✅ SUBSCRIPTION SYSTEM WORKING!`);
        console.log(`  - Subscription ID: ${subResult.data.subscription_id}`);
        console.log(`  - Amount: ₹${subResult.data.amount/100}`);
        console.log(`  - Currency: ${subResult.data.currency}`);
        console.log(`  - Auto-renewal: YES`);
      } else {
        console.log(`❌ Subscription Failed: ${JSON.stringify(subResult.data)}`);
      }
    } catch (error) {
      console.log(`❌ Subscription Error: ${error.message}`);
    }

    // Test 2: One-Time System
    console.log('\n💳 Testing One-Time System...');
    try {
      const orderResult = await supabase.functions.invoke('create-razorpay-order', {
        body: {
          planId: 'Pro',
          currency: 'INR',
          userCountry: 'IN'
        }
      });

      if (orderResult.error) {
        console.log(`❌ One-Time Error: ${orderResult.error.message}`);
      } else if (orderResult.data?.success) {
        console.log(`✅ ONE-TIME SYSTEM WORKING!`);
        console.log(`  - Order ID: ${orderResult.data.order?.id}`);
        console.log(`  - Amount: ₹${orderResult.data.order?.amount/100}`);
        console.log(`  - Currency: ${orderResult.data.order?.currency}`);
        console.log(`  - Auto-renewal: NO`);
      } else {
        console.log(`❌ One-Time Failed: ${JSON.stringify(orderResult.data)}`);
      }
    } catch (error) {
      console.log(`❌ One-Time Error: ${error.message}`);
    }

    // Check pricing display
    console.log('\n💰 Checking pricing display...');
    const priceElements = document.querySelectorAll('[class*="price"], [class*="amount"]');
    const priceTexts = [];
    
    priceElements.forEach(el => {
      const text = el.textContent?.trim();
      if (text && (text.includes('₹') || text.includes('$'))) {
        priceTexts.push(text);
      }
    });

    if (priceTexts.length > 0) {
      console.log(`✅ Found pricing elements:`);
      priceTexts.forEach(price => console.log(`  - ${price}`));
      
      const hasINR = priceTexts.some(price => price.includes('₹'));
      if (hasINR) {
        console.log(`✅ INDIAN PRICING DETECTED (₹)`);
      } else {
        console.log(`⚠️  USD pricing detected ($)`);
      }
    } else {
      console.log(`⚠️  No pricing elements found on page`);
    }

    console.log('\n🎯 TEST COMPLETE!');
    console.log('\n📋 SUMMARY:');
    console.log(`- Payment toggle buttons: ${toggleButtons.length}`);
    console.log(`- Upgrade buttons: ${upgradeButtons.length}`);
    console.log(`- Subscription system: Check results above`);
    console.log(`- One-time system: Check results above`);
    console.log(`- Pricing display: Check results above`);

    console.log('\n💡 NEXT STEPS:');
    console.log('1. If both payment systems work, the toggle should work');
    console.log('2. Try clicking the toggle buttons and upgrade buttons');
    console.log('3. Monitor console for payment system calls');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testDashboardToggle();

// Make functions available for manual testing
window.testSubscription = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return console.error('❌ Please log in');
  
  return await supabase.functions.invoke('create-razorpay-subscription', {
    body: {
      planId: 'Pro',
      userEmail: user.email,
      userName: user.user_metadata?.full_name || user.email,
      currency: 'INR',
      userCountry: 'IN'
    }
  });
};

window.testOneTime = async () => {
  return await supabase.functions.invoke('create-razorpay-order', {
    body: {
      planId: 'Pro',
      currency: 'INR',
      userCountry: 'IN'
    }
  });
};

console.log('\n🎮 Manual test functions available:');
console.log('- testSubscription() - Test subscription system');
console.log('- testOneTime() - Test one-time system');
