import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RazorpayPlan {
  id: string;
  entity: string;
  interval: number;
  period: string;
  item: {
    id: string;
    name: string;
    description: string;
    amount: number;
    currency: string;
  };
  notes: Record<string, string>;
  created_at: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Razorpay configuration
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')

    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new Error('Razorpay credentials not configured')
    }

    const authHeader = 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`)

    // Define plans to create
    const plansToCreate = [
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
    ]

    const results = []

    // Check existing plans first
    const existingPlansResponse = await fetch('https://api.razorpay.com/v1/plans', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      }
    })

    const existingPlansData = await existingPlansResponse.json()
    const existingPlanIds = existingPlansData.items?.map((plan: RazorpayPlan) => plan.id) || []

    // Create plans that don't exist
    for (const planData of plansToCreate) {
      if (existingPlanIds.includes(planData.id)) {
        results.push({
          plan_id: planData.id,
          status: 'already_exists',
          message: `Plan ${planData.id} already exists`
        })
        continue
      }

      try {
        const createResponse = await fetch('https://api.razorpay.com/v1/plans', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(planData)
        })

        const createData = await createResponse.json()

        if (createResponse.ok) {
          results.push({
            plan_id: createData.id,
            status: 'created',
            message: `Plan ${createData.id} created successfully`,
            plan_details: createData
          })
        } else {
          results.push({
            plan_id: planData.id,
            status: 'error',
            message: `Failed to create plan: ${createData.error?.description || 'Unknown error'}`,
            error: createData.error
          })
        }
      } catch (error) {
        results.push({
          plan_id: planData.id,
          status: 'error',
          message: `Error creating plan: ${error.message}`,
          error: error
        })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Razorpay plans setup completed',
      results: results,
      summary: {
        total_plans: plansToCreate.length,
        created: results.filter(r => r.status === 'created').length,
        already_exists: results.filter(r => r.status === 'already_exists').length,
        errors: results.filter(r => r.status === 'error').length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error setting up Razorpay plans:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
