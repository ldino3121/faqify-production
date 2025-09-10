/**
 * Setup script to create Razorpay subscription plans
 * Run this script to initialize the required plans in your Razorpay account
 */

const https = require('https');

// Configuration
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'your_razorpay_key_id';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_key_secret';

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || RAZORPAY_KEY_ID === 'your_razorpay_key_id') {
  console.error('❌ Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables');
  console.log('💡 Example: set RAZORPAY_KEY_ID=rzp_test_xxx && set RAZORPAY_KEY_SECRET=xxx && node setup-razorpay-plans-fixed.js');
  process.exit(1);
}

const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');

// Plans to create
const plans = [
  {
    id: 'faqify_pro_monthly_inr',
    period: 'monthly',
    interval: 1,
    item: {
      name: 'FAQify Pro Plan',
      description: 'Generate up to 100 FAQs per month with advanced features',
      amount: 19900, // ₹199 in paise
      currency: 'INR'
    },
    notes: {
      plan_tier: 'Pro',
      faq_limit: '100',
      billing_cycle: 'monthly',
      currency: 'INR',
      created_by: 'faqify_setup'
    }
  },
  {
    id: 'faqify_business_monthly_inr',
    period: 'monthly',
    interval: 1,
    item: {
      name: 'FAQify Business Plan',
      description: 'Generate up to 500 FAQs per month with premium features',
      amount: 99900, // ₹999 in paise
      currency: 'INR'
    },
    notes: {
      plan_tier: 'Business',
      faq_limit: '500',
      billing_cycle: 'monthly',
      currency: 'INR',
      created_by: 'faqify_setup'
    }
  },
  {
    id: 'faqify_pro_monthly_usd',
    period: 'monthly',
    interval: 1,
    item: {
      name: 'FAQify Pro Plan (International)',
      description: 'Generate up to 100 FAQs per month with advanced features',
      amount: 900, // $9 in cents
      currency: 'USD'
    },
    notes: {
      plan_tier: 'Pro',
      faq_limit: '100',
      billing_cycle: 'monthly',
      currency: 'USD',
      created_by: 'faqify_setup'
    }
  },
  {
    id: 'faqify_business_monthly_usd',
    period: 'monthly',
    interval: 1,
    item: {
      name: 'FAQify Business Plan (International)',
      description: 'Generate up to 500 FAQs per month with premium features',
      amount: 2900, // $29 in cents
      currency: 'USD'
    },
    notes: {
      plan_tier: 'Business',
      faq_limit: '500',
      billing_cycle: 'monthly',
      currency: 'USD',
      created_by: 'faqify_setup'
    }
  }
];

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Check existing plans
async function getExistingPlans() {
  const options = {
    hostname: 'api.razorpay.com',
    path: '/v1/plans',
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options);
    if (response.status === 200) {
      return response.data.items || [];
    } else {
      console.error('❌ Failed to fetch existing plans:', response.data);
      return [];
    }
  } catch (error) {
    console.error('❌ Error fetching plans:', error.message);
    return [];
  }
}

// Create a plan
async function createPlan(planData) {
  const options = {
    hostname: 'api.razorpay.com',
    path: '/v1/plans',
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options, planData);
    return response;
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

// Main setup function
async function setupPlans() {
  console.log('🚀 Setting up Razorpay subscription plans for FAQify...\n');

  // Get existing plans
  console.log('📋 Checking existing plans...');
  const existingPlans = await getExistingPlans();
  const existingPlanIds = existingPlans.map(plan => plan.id);

  console.log(`✅ Found ${existingPlans.length} existing plans\n`);

  const results = [];

  // Create plans
  for (const planData of plans) {
    console.log(`🔄 Processing plan: ${planData.id}`);

    if (existingPlanIds.includes(planData.id)) {
      console.log(`   ✅ Plan already exists: ${planData.id}`);
      results.push({ plan_id: planData.id, status: 'already_exists' });
      continue;
    }

    const response = await createPlan(planData);

    if (response.status === 200 || response.status === 201) {
      console.log(`   ✅ Created plan: ${planData.id}`);
      console.log(`      💰 Amount: ${planData.item.currency} ${planData.item.amount / (planData.item.currency === 'INR' ? 100 : 100)}`);
      results.push({ plan_id: planData.id, status: 'created' });
    } else {
      console.log(`   ❌ Failed to create plan: ${planData.id}`);
      console.log(`      Error: ${response.data?.error?.description || 'Unknown error'}`);
      results.push({ plan_id: planData.id, status: 'error', error: response.data });
    }
  }

  // Summary
  console.log('\n📊 SETUP SUMMARY:');
  console.log('==================');
  
  const created = results.filter(r => r.status === 'created').length;
  const existing = results.filter(r => r.status === 'already_exists').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`✅ Created: ${created} plans`);
  console.log(`ℹ️  Already existed: ${existing} plans`);
  console.log(`❌ Errors: ${errors} plans`);

  if (created > 0 || existing > 0) {
    console.log('\n🎉 Razorpay subscription plans are ready!');
    console.log('💡 You can now use the subscription system in FAQify');
  }

  if (errors > 0) {
    console.log('\n⚠️  Some plans failed to create. Check the errors above.');
    process.exit(1);
  }
}

// Run setup
setupPlans().catch(error => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});
