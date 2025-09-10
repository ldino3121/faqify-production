/**
 * Debug script to check what Razorpay plans exist in your account
 * This will help us identify the correct plan IDs to use
 */

import https from 'https';

// Use your actual Razorpay credentials
const RAZORPAY_KEY_ID = 'rzp_test_Ej8Ej8Ej8Ej8Ej8E'; // Replace with your actual key
const RAZORPAY_KEY_SECRET = 'your_secret_key'; // Replace with your actual secret

const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');

// Helper function to make HTTP requests
function makeRequest(options) {
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
    req.end();
  });
}

// Get all plans from Razorpay
async function getAllPlans() {
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
    console.log('🔍 Fetching all plans from Razorpay...\n');
    
    const response = await makeRequest(options);
    
    if (response.status === 200) {
      const plans = response.data.items || [];
      
      console.log(`📋 Found ${plans.length} plans in your Razorpay account:\n`);
      
      if (plans.length === 0) {
        console.log('❌ No plans found! You need to create plans first.');
        console.log('💡 Run: node setup-razorpay-plans-fixed.js');
        return;
      }
      
      plans.forEach((plan, index) => {
        console.log(`${index + 1}. Plan ID: ${plan.id}`);
        console.log(`   Name: ${plan.item?.name || 'N/A'}`);
        console.log(`   Amount: ${plan.item?.currency || 'N/A'} ${(plan.item?.amount || 0) / 100}`);
        console.log(`   Period: ${plan.period} (${plan.interval} ${plan.period})`);
        console.log(`   Status: ${plan.status || 'N/A'}`);
        console.log(`   Created: ${new Date(plan.created_at * 1000).toLocaleString()}`);
        console.log('');
      });
      
      // Check for FAQify specific plans
      const faqifyPlans = plans.filter(plan => 
        plan.id.includes('faqify') || 
        plan.item?.name?.toLowerCase().includes('faqify') ||
        plan.id.includes('pro') || 
        plan.id.includes('business')
      );
      
      if (faqifyPlans.length > 0) {
        console.log('🎯 FAQify-related plans found:');
        faqifyPlans.forEach(plan => {
          console.log(`   ✅ ${plan.id} - ${plan.item?.name}`);
        });
      } else {
        console.log('⚠️  No FAQify-specific plans found.');
        console.log('💡 You may need to create them using: node setup-razorpay-plans-fixed.js');
      }
      
    } else {
      console.error('❌ Failed to fetch plans:', response.data);
      console.log('Status:', response.status);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the debug
getAllPlans();
