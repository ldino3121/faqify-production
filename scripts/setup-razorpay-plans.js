/**
 * Script to create Razorpay subscription plans
 * Run this once to set up plans in your Razorpay dashboard
 */

const Razorpay = require('razorpay');

// Initialize Razorpay with your credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_your_key_id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_key_secret'
});

const plans = [
  {
    id: 'faqify_pro_monthly',
    period: 'monthly',
    interval: 1,
    item: {
      name: 'FAQify Pro Plan',
      amount: 900, // ₹9.00 in paise
      currency: 'INR',
      description: 'Generate up to 100 FAQs per month with advanced features'
    },
    notes: {
      plan_tier: 'Pro',
      faq_limit: '100',
      billing_cycle: 'monthly'
    }
  },
  {
    id: 'faqify_business_monthly',
    period: 'monthly',
    interval: 1,
    item: {
      name: 'FAQify Business Plan',
      amount: 2900, // ₹29.00 in paise
      currency: 'INR',
      description: 'Generate up to 500 FAQs per month with priority support'
    },
    notes: {
      plan_tier: 'Business',
      faq_limit: '500',
      billing_cycle: 'monthly'
    }
  }
];

async function createPlans() {
  console.log('🚀 Setting up Razorpay subscription plans...\n');

  for (const planConfig of plans) {
    try {
      console.log(`Creating plan: ${planConfig.item.name}`);
      
      const plan = await razorpay.plans.create(planConfig);
      
      console.log(`✅ Plan created successfully!`);
      console.log(`   Plan ID: ${plan.id}`);
      console.log(`   Amount: ₹${plan.item.amount / 100}`);
      console.log(`   Period: ${plan.period} (${plan.interval} ${plan.period})\n`);
      
    } catch (error) {
      console.error(`❌ Error creating plan ${planConfig.id}:`, error.error || error.message);
      
      // If plan already exists, fetch and display it
      if (error.error?.code === 'BAD_REQUEST_ERROR' && error.error?.description?.includes('already exists')) {
        try {
          const existingPlan = await razorpay.plans.fetch(planConfig.id);
          console.log(`ℹ️  Plan already exists: ${existingPlan.id}\n`);
        } catch (fetchError) {
          console.error(`❌ Error fetching existing plan:`, fetchError.message);
        }
      }
    }
  }

  console.log('🎉 Plan setup complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Update your environment variables with the plan IDs');
  console.log('2. Test subscription creation in your application');
  console.log('3. Set up webhooks for subscription events');
}

// Fetch existing plans
async function listExistingPlans() {
  try {
    console.log('📋 Fetching existing plans...\n');
    
    const plans = await razorpay.plans.all();
    
    if (plans.items.length === 0) {
      console.log('No plans found. Creating new plans...\n');
      return false;
    }

    console.log('Existing plans:');
    plans.items.forEach(plan => {
      console.log(`- ${plan.item.name} (${plan.id}): ₹${plan.item.amount / 100}/${plan.period}`);
    });
    
    console.log('\n');
    return true;
  } catch (error) {
    console.error('❌ Error fetching plans:', error.message);
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔧 Razorpay Subscription Plans Setup\n');
  
  // Check if credentials are provided
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.log('⚠️  Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables');
    console.log('   You can find these in your Razorpay Dashboard > Settings > API Keys\n');
    
    console.log('Example usage:');
    console.log('RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx node scripts/setup-razorpay-plans.js');
    return;
  }

  // List existing plans first
  const hasExistingPlans = await listExistingPlans();
  
  // Create plans
  await createPlans();
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createPlans, listExistingPlans };
