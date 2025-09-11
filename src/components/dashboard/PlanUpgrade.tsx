import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Star,
  Zap,
  CreditCard,
  Shield,
  Users,
  Code,
  Headphones,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRazorpaySubscription } from "@/hooks/useRazorpaySubscription";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";

type PlanType = "Free" | "Pro" | "Business";

interface Plan {
  name: PlanType;
  price: string;
  originalPrice: string | null;
  period: string;
  description: string;
  features: string[];
  limitations: string[];
  cta: string;
  popular: boolean;
  current: boolean;
  disabled: boolean;
}

export const PlanUpgrade = () => {
  const [paymentType, setPaymentType] = useState<'one_time' | 'subscription'>('subscription');
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [userCountry, setUserCountry] = useState<string>('US');
  const [userCurrency, setUserCurrency] = useState<string>('usd');
  const { toast } = useToast();
  const { createAndOpenSubscription, loading: subscriptionLoading } = useRazorpaySubscription();
  const { subscription, loading: subscriptionDataLoading } = useSubscription();

  // Get current plan from real subscription data
  const currentPlan = subscription?.plan_tier || "Free";

  // Load Razorpay script and detect user location
  useEffect(() => {
    const loadRazorpay = () => {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => {
          setRazorpayLoaded(true);
          resolve(true);
        };
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
      });
    };

    // Detect user location for currency
    const detectLocation = async () => {
      try {
        // Try to get user's timezone first
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        // Simple timezone to country mapping for major regions
        if (timezone.includes('Asia/Kolkata') || timezone.includes('Asia/Calcutta')) {
          setUserCountry('IN');
          setUserCurrency('inr');
        } else if (timezone.includes('Europe/')) {
          setUserCountry('EU');
          setUserCurrency('eur');
        } else if (timezone.includes('Europe/London')) {
          setUserCountry('GB');
          setUserCurrency('gbp');
        } else {
          // Default to US/USD for other regions
          setUserCountry('US');
          setUserCurrency('usd');
        }
      } catch (error) {
        console.log('Location detection failed, using default USD');
        setUserCountry('US');
        setUserCurrency('usd');
      }
    };

    if (!window.Razorpay) {
      loadRazorpay();
    } else {
      setRazorpayLoaded(true);
    }

    detectLocation();
  }, []);



  // Smart pricing based on user location
  const getPrice = (usdPrice: number) => {
    switch (userCurrency) {
      case 'inr':
        return {
          amount: usdPrice * 83, // Approximate USD to INR conversion
          symbol: '₹',
          currency: 'INR'
        };
      case 'eur':
        return {
          amount: Math.round(usdPrice * 0.85), // Approximate USD to EUR conversion
          symbol: '€',
          currency: 'EUR'
        };
      case 'gbp':
        return {
          amount: Math.round(usdPrice * 0.75), // Approximate USD to GBP conversion
          symbol: '£',
          currency: 'GBP'
        };
      default:
        return {
          amount: usdPrice,
          symbol: '$',
          currency: 'USD'
        };
    }
  };

  const plans: Plan[] = [
    {
      name: "Free",
      price: "$0",
      originalPrice: null,
      period: "forever",
      description: "Perfect for trying out FAQify",
      features: [
        "5 FAQ generations per month",
        "Website URL analysis",
        "Text content analysis",
        "Document upload (PDF, DOCX)",
        "AI-powered FAQ generation",
        "Embed widget",
        "WordPress integration",
        "Analytics dashboard",
        "Export functionality",
        "Email support"
      ],
      limitations: [],
      cta: currentPlan === "Free" ? "Current Plan" : "Start Free",
      popular: false,
      current: currentPlan === "Free",
      disabled: false
    },
    {
      name: "Pro",
      price: (() => {
        const monthlyPrice = getPrice(9);
        return `${monthlyPrice.symbol}${monthlyPrice.amount}`;
      })(),
      originalPrice: null,
      period: "per month",
      description: "Ideal for small businesses and bloggers",
      features: [
        "100 FAQ generations per month",
        "Website URL analysis",
        "Text & document upload",
        "Advanced embedding options",
        "Priority email support",
        "Export to multiple formats",
        "Custom styling options",
        "Analytics dashboard"
      ],
      limitations: [],
      cta: currentPlan === "Pro" ? "Current Plan" : "Upgrade to Pro",
      popular: true,
      current: currentPlan === "Pro",
      disabled: false
    },
    {
      name: "Business",
      price: (() => {
        const monthlyPrice = getPrice(29);
        return `${monthlyPrice.symbol}${monthlyPrice.amount}`;
      })(),
      originalPrice: null,
      period: "per month",
      description: "For agencies and large websites",
      features: [
        "500 FAQ generations per month",
        "All input methods included",
        "White-label embedding",
        "Custom branding options",
        "24/7 priority support",
        "API access",
        "Team collaboration tools",
        "Advanced analytics",
        "Custom integrations",
        "Dedicated account manager"
      ],
      limitations: [],
      cta: currentPlan === "Business" ? "Current Plan" : "Upgrade to Business",
      popular: false,
      current: currentPlan === "Business",
      disabled: false
    }
  ];

  const handleUpgrade = async (planName: string) => {
    // Allow re-purchasing same plan if FAQ credits are exhausted
    // Only block if user is on same plan AND has remaining FAQs
    if (planName === currentPlan && subscription && subscription.faq_usage_current < subscription.faq_usage_limit) {
      toast({
        title: "Plan Already Active",
        description: `You're already on the ${planName} plan with ${subscription.faq_usage_limit - subscription.faq_usage_current} FAQs remaining.`,
        variant: "destructive",
      });
      return;
    }

    // Don't process Free plan clicks
    if (planName === "Free") return;

    if (paymentType === 'subscription') {
      // Use Razorpay native subscriptions
      await handleSubscriptionUpgrade(planName as 'Pro' | 'Business');
    } else {
      // Use one-time payment (existing logic)
      handleOneTimeUpgrade(planName);
    }
  };

  const handleSubscriptionUpgrade = async (planId: 'Pro' | 'Business') => {
    if (processingPlan) return;

    setProcessingPlan(planId);

    try {
      toast({
        title: "Creating Subscription",
        description: `Setting up your ${planId} plan subscription...`,
      });

      // Use standard USD pricing - Razorpay handles automatic conversion
      const result = await createAndOpenSubscription(planId);

      if (result.success) {
        toast({
          title: "Subscription Created!",
          description: `Your ${planId} plan subscription is being processed. Complete the payment to activate.`,
        });
      } else {
        throw new Error(result.error || 'Failed to create subscription');
      }
    } catch (error) {
      console.error('Subscription upgrade error:', error);
      toast({
        title: "Subscription Failed",
        description: "Failed to create subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleOneTimeUpgrade = async (planName: string) => {
    if (!window.Razorpay) {
      toast({
        title: "Payment System Loading",
        description: "Please wait for the payment system to load and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setProcessingPlan(planName);

      toast({
        title: `Creating ${planName} Order`,
        description: "Setting up your payment...",
      });

      // Create Razorpay order via edge function
      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: {
          planId: planName.toLowerCase(),
          currency: userCurrency,
          userCountry: userCountry,
          paymentType: 'onetime'
        }
      });

      if (error || !data.success || !data.order) {
        throw new Error('Failed to create payment order');
      }

      // Configure Razorpay options
      const options = {
        key: data.order.key,
        amount: data.order.amount,
        currency: data.order.currency.toUpperCase(),
        name: 'FAQify',
        description: `${data.plan.name} Plan (30 Days)`,
        order_id: data.order.id,
        handler: async function (response: any) {
          try {
            // Verify payment on backend
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              }
            });

            if (verifyError) throw verifyError;

            if (verifyData.success) {
              toast({
                title: "Payment Successful!",
                description: `Your ${planName} plan is now active for 30 days. Redirecting...`,
              });

              setTimeout(() => {
                window.location.reload();
              }, 2000);
            } else {
              throw new Error('Payment verification failed');
            }
          } catch (error) {
            console.error('Payment verification error:', error);
            toast({
              title: "Payment Verification Failed",
              description: "Please contact support if your payment was deducted.",
              variant: "destructive",
            });
          }
        },
        prefill: {
          name: data.user.name,
          email: data.user.email
        },
        theme: {
          color: '#3B82F6'
        },
        modal: {
          ondismiss: function () {
            setProcessingPlan(null);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      toast({
        title: "Payment Failed",
        description: "Failed to start payment process. Please try again.",
        variant: "destructive",
      });
      setProcessingPlan(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Upgrade Your Plan</h1>
        <p className="text-gray-400 mb-4">Choose the perfect plan for your FAQ generation needs</p>

        {/* Payment Type Toggle */}
        <div className="flex items-center justify-center space-x-4 mb-8">
          <div className="flex items-center space-x-2 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setPaymentType('subscription')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                paymentType === 'subscription'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Auto Renew
            </button>
            <button
              onClick={() => setPaymentType('one_time')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                paymentType === 'one_time'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              One Time
            </button>
          </div>
        </div>

        {/* Payment Type Description */}
        <div className="text-center mb-6">
          <div className="text-sm text-gray-500 max-w-lg mx-auto">
            {paymentType === 'subscription' ? (
              <p>✅ Automatic monthly renewal • Cancel anytime • Managed via Razorpay</p>
            ) : (
              <p>💡 Pay once for 30 days • Manual renewal required • No auto-billing</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
        {plans.map((plan, index) => (
          <Card 
            key={index}
            className={`relative bg-gray-900/50 border-gray-800 hover:border-blue-500/50 transition-all duration-300 ${
              plan.popular ? 'ring-2 ring-blue-500/50 border-blue-500 scale-105' : ''
            } ${plan.current ? 'ring-2 ring-green-500/50 border-green-500' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <div className="flex items-center space-x-1 bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
                  <Star className="h-4 w-4" />
                  <span>Most Popular</span>
                </div>
              </div>
            )}
            
            {plan.current && (
              <div className="absolute -top-4 right-4">
                <Badge className="bg-green-600 text-white">Current Plan</Badge>
              </div>
            )}

            <CardHeader className="text-center pb-8">
              <CardTitle className="text-2xl text-white mb-2">{plan.name}</CardTitle>
              <div className="mb-4">
                <div className="flex items-center justify-center space-x-2">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <div className="text-left">
                    {plan.originalPrice && (
                      <div className="text-sm text-gray-400 line-through">{plan.originalPrice}</div>
                    )}
                    <div className="text-gray-400 text-sm">/{plan.period}</div>
                  </div>
                </div>
              </div>
              <CardDescription className="text-gray-400">
                {plan.description}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div>
                <h4 className="text-white font-medium mb-3">What's included:</h4>
                <ul className="space-y-2">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start space-x-3">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {plan.limitations.length > 0 && (
                <div>
                  <h4 className="text-gray-400 font-medium mb-3">Limitations:</h4>
                  <ul className="space-y-2">
                    {plan.limitations.map((limitation, limitIndex) => (
                      <li key={limitIndex} className="flex items-start space-x-3">
                        <div className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0">✕</div>
                        <span className="text-gray-400 text-sm">{limitation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                onClick={() => handleUpgrade(plan.name)}
                disabled={
                  processingPlan === plan.name ||
                  subscriptionLoading ||
                  subscriptionDataLoading ||
                  (!razorpayLoaded && plan.name !== "Free") ||
                  // Allow re-purchasing same plan if FAQ credits exhausted
                  (plan.current && plan.name !== "Free" && subscription && subscription.faq_usage_current < subscription.faq_usage_limit)
                }
                className={`w-full py-3 ${
                  plan.current
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : plan.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-600'
                }`}
              >
                {processingPlan === plan.name ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {paymentType === 'subscription' ? 'Creating Subscription...' : 'Processing...'}
                  </>
                ) : !razorpayLoaded && plan.name !== "Free" ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Loading Payment...
                  </>
                ) : plan.current ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {plan.cta}
                  </>
                ) : (
                  <>
                    {plan.name !== "Free" && <CreditCard className="h-4 w-4 mr-2" />}
                    {plan.cta}
                    {paymentType === 'subscription' && plan.name !== "Free" && (
                      <span className="ml-2 text-xs opacity-75">
                        (Auto-Renewal)
                      </span>
                    )}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feature Comparison */}
      <Card className="bg-gray-900/50 border-gray-800 max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-white text-center">Feature Comparison</CardTitle>
          <CardDescription className="text-gray-400 text-center">
            Detailed breakdown of what's included in each plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-3 text-white">Feature</th>
                  <th className="text-center py-3 text-white">Free</th>
                  <th className="text-center py-3 text-white">Pro</th>
                  <th className="text-center py-3 text-white">Business</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">FAQ Generations</td>
                  <td className="text-center py-3 text-gray-400">10 (one-time)</td>
                  <td className="text-center py-3 text-white">500/month</td>
                  <td className="text-center py-3 text-white">2,500/month</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">Document Upload</td>
                  <td className="text-center py-3 text-red-400">✕</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">White-label Embedding</td>
                  <td className="text-center py-3 text-red-400">✕</td>
                  <td className="text-center py-3 text-red-400">✕</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">API Access</td>
                  <td className="text-center py-3 text-red-400">✕</td>
                  <td className="text-center py-3 text-red-400">✕</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr>
                  <td className="py-3 text-gray-300">Support Level</td>
                  <td className="text-center py-3 text-gray-400">Email</td>
                  <td className="text-center py-3 text-white">Priority</td>
                  <td className="text-center py-3 text-white">24/7 Priority</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* FAQ about Plans */}
      <Card className="bg-gray-900/50 border-gray-800 max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-white">Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-white font-medium mb-2">Can I change plans anytime?</h4>
            <p className="text-gray-400 text-sm">Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
          </div>
          <div>
            <h4 className="text-white font-medium mb-2">What happens to my FAQs if I downgrade?</h4>
            <p className="text-gray-400 text-sm">Your existing FAQs remain accessible, but you'll be limited to your new plan's monthly generation limits.</p>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};
