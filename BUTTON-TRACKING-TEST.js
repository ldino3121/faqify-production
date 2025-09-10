// BUTTON TRACKING TEST
// Run this in your browser console to track which upgrade buttons you're clicking

console.log('🎯 Button Tracking Test Started');
console.log('This will track which upgrade buttons you click and show which payment system they use');

// Function to track button clicks
function trackUpgradeButtons() {
  // Find all upgrade buttons
  const buttons = document.querySelectorAll('button');
  let upgradeButtons = [];
  
  buttons.forEach((button, index) => {
    const text = button.textContent?.toLowerCase() || '';
    if (text.includes('upgrade') || text.includes('choose') || text.includes('pro') || text.includes('business')) {
      upgradeButtons.push({
        element: button,
        text: button.textContent,
        index: index
      });
    }
  });
  
  console.log(`🔍 Found ${upgradeButtons.length} potential upgrade buttons:`);
  upgradeButtons.forEach((btn, i) => {
    console.log(`  ${i + 1}. "${btn.text}"`);
  });
  
  // Add click listeners to track which buttons are clicked
  upgradeButtons.forEach((btn, i) => {
    btn.element.addEventListener('click', function(event) {
      console.log(`\n🎯 BUTTON CLICKED: "${btn.text}"`);
      console.log(`📍 Button Index: ${i + 1}`);
      console.log(`📄 Page URL: ${window.location.href}`);
      
      // Check if we're on dashboard or landing page
      if (window.location.href.includes('dashboard')) {
        console.log(`📊 LOCATION: Dashboard`);
        console.log(`🔄 EXPECTED SYSTEM: Subscription (create-razorpay-subscription)`);
        console.log(`💡 Should see: subscription_id, auto-renewal enabled`);
      } else {
        console.log(`🏠 LOCATION: Landing Page`);
        console.log(`💰 EXPECTED SYSTEM: One-time (create-razorpay-order)`);
        console.log(`💡 Should see: order_id, no auto-renewal`);
      }
      
      // Set up console monitoring for the next few seconds
      console.log(`\n👀 MONITORING CONSOLE FOR PAYMENT LOGS...`);
      console.log(`Look for logs starting with:`);
      console.log(`  - "🚀 Creating Razorpay subscription" (subscription system)`);
      console.log(`  - "Payment Type: subscription" (subscription system)`);
      console.log(`  - "Creating Razorpay order" (one-time system)`);
      
      // Monitor for specific function calls
      setTimeout(() => {
        console.log(`\n📋 MONITORING COMPLETE`);
        console.log(`Check the logs above to see which payment system was called`);
      }, 5000);
    });
  });
  
  return upgradeButtons.length;
}

// Function to check current page configuration
function checkPageConfiguration() {
  console.log('\n🔧 PAGE CONFIGURATION CHECK:');
  console.log(`📄 Current URL: ${window.location.href}`);
  
  if (window.location.href.includes('dashboard')) {
    console.log(`📊 PAGE TYPE: Dashboard`);
    console.log(`🔄 EXPECTED PAYMENT SYSTEM: Subscription`);
    console.log(`📁 COMPONENT: PlanUpgradeData.tsx`);
    console.log(`🎯 FUNCTION: handleSubscriptionPayment() -> create-razorpay-subscription`);
  } else if (window.location.href.includes('pricing') || window.location.pathname === '/') {
    console.log(`🏠 PAGE TYPE: Landing/Pricing`);
    console.log(`💰 EXPECTED PAYMENT SYSTEM: One-time`);
    console.log(`📁 COMPONENT: Pricing.tsx`);
    console.log(`🎯 FUNCTION: handleRazorpayPayment() -> create-razorpay-order`);
  } else {
    console.log(`❓ PAGE TYPE: Unknown`);
    console.log(`⚠️  May not have upgrade buttons`);
  }
}

// Function to simulate clicking upgrade buttons for testing
function simulateUpgradeClick() {
  const buttons = document.querySelectorAll('button');
  let upgradeButton = null;
  
  buttons.forEach(button => {
    const text = button.textContent?.toLowerCase() || '';
    if (text.includes('upgrade to pro') || text.includes('choose pro')) {
      upgradeButton = button;
    }
  });
  
  if (upgradeButton) {
    console.log(`\n🎯 SIMULATING CLICK ON: "${upgradeButton.textContent}"`);
    upgradeButton.click();
  } else {
    console.log(`\n❌ No "Upgrade to Pro" button found on this page`);
    console.log(`Available buttons:`);
    buttons.forEach((btn, i) => {
      if (btn.textContent) {
        console.log(`  ${i + 1}. "${btn.textContent}"`);
      }
    });
  }
}

// Run the tracking setup
const buttonCount = trackUpgradeButtons();
checkPageConfiguration();

console.log(`\n✅ Button tracking setup complete!`);
console.log(`📊 Monitoring ${buttonCount} buttons`);
console.log(`\n🎮 AVAILABLE FUNCTIONS:`);
console.log(`- simulateUpgradeClick() - Automatically click "Upgrade to Pro" button`);
console.log(`- trackUpgradeButtons() - Re-scan for upgrade buttons`);
console.log(`- checkPageConfiguration() - Check current page setup`);

console.log(`\n💡 INSTRUCTIONS:`);
console.log(`1. Click any upgrade button on this page`);
console.log(`2. Watch the console for payment system logs`);
console.log(`3. Compare with expected system for this page type`);

// Make functions available globally
window.simulateUpgradeClick = simulateUpgradeClick;
window.trackUpgradeButtons = trackUpgradeButtons;
window.checkPageConfiguration = checkPageConfiguration;
