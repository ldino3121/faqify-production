// DASHBOARD TOGGLE TEST SCRIPT
// Run this in your FAQify dashboard browser console (http://localhost:8082/dashboard)

console.log('🎯 Dashboard Toggle Test Started');
console.log('Testing One-Time vs Subscription payment toggle');

async function testPaymentToggle() {
  try {
    // Check if we're on the dashboard
    if (!window.location.href.includes('dashboard')) {
      console.error('❌ Please navigate to http://localhost:8082/dashboard first');
      return;
    }

    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('❌ Please log in to your dashboard first');
      return;
    }

    console.log(`✅ Authenticated as: ${user.email}`);

    // Look for payment type toggle buttons
    console.log('\n🔍 Looking for payment toggle buttons...');
    
    const buttons = document.querySelectorAll('button');
    let toggleButtons = [];
    
    buttons.forEach((button, index) => {
      const text = button.textContent?.toLowerCase() || '';
      if (text.includes('auto-renewal') || text.includes('subscription') || text.includes('one-time')) {
        toggleButtons.push({
          element: button,
          text: button.textContent,
          index: index
        });
      }
    });

    if (toggleButtons.length === 0) {
      console.log('❌ No payment toggle buttons found');
      console.log('Available buttons:');
      buttons.forEach((btn, i) => {
        if (btn.textContent && btn.textContent.trim()) {
          console.log(`  ${i + 1}. "${btn.textContent.trim()}"`);
        }
      });
      return;
    }

    console.log(`✅ Found ${toggleButtons.length} payment toggle buttons:`);
    toggleButtons.forEach((btn, i) => {
      console.log(`  ${i + 1}. "${btn.text}"`);
    });

    // Test clicking each toggle button
    console.log('\n🧪 Testing toggle functionality...');
    
    for (let i = 0; i < toggleButtons.length; i++) {
      const btn = toggleButtons[i];
      console.log(`\n📋 Testing button: "${btn.text}"`);
      
      // Add click listener to monitor what happens
      const originalConsoleLog = console.log;
      const logs = [];
      
      console.log = function(...args) {
        logs.push(args.join(' '));
        originalConsoleLog.apply(console, args);
      };

      // Click the button
      btn.element.click();
      
      // Wait a moment for any async operations
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Restore console.log
      console.log = originalConsoleLog;
      
      // Analyze the logs
      const relevantLogs = logs.filter(log => 
        log.includes('payment') || 
        log.includes('subscription') || 
        log.includes('one-time') ||
        log.includes('razorpay')
      );
      
      if (relevantLogs.length > 0) {
        console.log(`  📥 Captured logs:`);
        relevantLogs.forEach(log => console.log(`    ${log}`));
      } else {
        console.log(`  ⚠️  No payment-related logs captured`);
      }
    }

    // Test upgrade button functionality
    console.log('\n🚀 Testing upgrade button functionality...');
    
    const upgradeButtons = [];
    buttons.forEach((button, index) => {
      const text = button.textContent?.toLowerCase() || '';
      if (text.includes('upgrade') || text.includes('choose pro') || text.includes('choose business')) {
        upgradeButtons.push({
          element: button,
          text: button.textContent,
          index: index
        });
      }
    });

    if (upgradeButtons.length > 0) {
      console.log(`✅ Found ${upgradeButtons.length} upgrade buttons:`);
      upgradeButtons.forEach((btn, i) => {
        console.log(`  ${i + 1}. "${btn.text}"`);
      });

      // Test the first upgrade button
      const testButton = upgradeButtons[0];
      console.log(`\n🧪 Testing upgrade button: "${testButton.text}"`);
      
      // Monitor network requests
      const originalFetch = window.fetch;
      const networkCalls = [];
      
      window.fetch = function(...args) {
        networkCalls.push({
          url: args[0],
          options: args[1],
          timestamp: new Date().toISOString()
        });
        return originalFetch.apply(this, args);
      };

      // Click the upgrade button
      testButton.element.click();
      
      // Wait for network calls
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Restore fetch
      window.fetch = originalFetch;
      
      // Analyze network calls
      const paymentCalls = networkCalls.filter(call => 
        call.url.includes('razorpay') || 
        call.url.includes('subscription') || 
        call.url.includes('order')
      );
      
      if (paymentCalls.length > 0) {
        console.log(`✅ Payment-related network calls detected:`);
        paymentCalls.forEach(call => {
          console.log(`  📡 ${call.url}`);
          if (call.url.includes('subscription')) {
            console.log(`    🔄 SUBSCRIPTION SYSTEM TRIGGERED`);
          } else if (call.url.includes('order')) {
            console.log(`    💳 ONE-TIME SYSTEM TRIGGERED`);
          }
        });
      } else {
        console.log(`⚠️  No payment-related network calls detected`);
        console.log(`All network calls:`);
        networkCalls.forEach(call => console.log(`  📡 ${call.url}`));
      }
    } else {
      console.log(`❌ No upgrade buttons found`);
    }

    console.log('\n🎯 TEST COMPLETE!');
    console.log('Check the logs above to see which payment system is being triggered');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Function to manually test specific payment types
window.testSubscriptionPayment = async () => {
  console.log('🔄 Testing Subscription Payment...');
  
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

  console.log('📥 Subscription Result:', result);
  
  if (result.data?.success) {
    console.log('✅ SUBSCRIPTION SYSTEM WORKING');
    console.log(`  - Subscription ID: ${result.data.subscription_id}`);
    console.log(`  - Amount: ₹${result.data.amount/100}`);
    console.log(`  - Auto-renewal: YES`);
  } else {
    console.log('❌ SUBSCRIPTION SYSTEM FAILED');
    console.log(`  - Error: ${result.error?.message || result.data?.error}`);
  }
  
  return result;
};

window.testOneTimePayment = async () => {
  console.log('💳 Testing One-Time Payment...');
  
  const result = await supabase.functions.invoke('create-razorpay-order', {
    body: {
      planId: 'Pro',
      currency: 'INR',
      userCountry: 'IN'
    }
  });

  console.log('📥 One-Time Result:', result);
  
  if (result.data?.success) {
    console.log('✅ ONE-TIME SYSTEM WORKING');
    console.log(`  - Order ID: ${result.data.order?.id}`);
    console.log(`  - Amount: ₹${result.data.order?.amount/100}`);
    console.log(`  - Auto-renewal: NO`);
  } else {
    console.log('❌ ONE-TIME SYSTEM FAILED');
    console.log(`  - Error: ${result.error?.message || result.data?.error}`);
  }
  
  return result;
};

// Auto-run the test
console.log('\n🎮 AVAILABLE FUNCTIONS:');
console.log('- testPaymentToggle() - Test the payment toggle functionality');
console.log('- testSubscriptionPayment() - Test subscription system directly');
console.log('- testOneTimePayment() - Test one-time system directly');

console.log('\n💡 INSTRUCTIONS:');
console.log('1. Make sure you\'re logged in to the dashboard');
console.log('2. Run testPaymentToggle() to test the toggle buttons');
console.log('3. Look for payment system logs in the console');

// Run the main test
testPaymentToggle();
