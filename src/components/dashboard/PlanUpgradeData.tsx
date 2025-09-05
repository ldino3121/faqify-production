import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Check, 
  Star, 
  Zap, 
  CreditCard,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";

// Declare Razorpay for TypeScript
declare global {
  interface Window {
    Razorpay: any;
  }
}

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

export const PlanUpgradeData = () => {
  const [isAnnual, setIsAnnual] = useState(false);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [userCountry, setUserCountry] = useState('US');
  const [preferredCurrency, setPreferredCurrency] = useState('usd');
  const { subscription, loading } = useSubscription();
  const { toast } = useToast();
  const { user } = useAuth();

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

    if (!window.Razorpay) {
      loadRazorpay();
    } else {
      setRazorpayLoaded(true);
    }

    // Detect user location for currency
    fetch('https://ipapi.co/json/')
      .then(response => response.json())
      .then(data => {
        setUserCountry(data.country_code || 'US');
        const currencyMap: { [key: string]: string } = {
          'IN': 'inr',
          'GB': 'gbp',
          'DE': 'eur', 'FR': 'eur', 'IT': 'eur', 'ES': 'eur', 'NL': 'eur'
        };
        setPreferredCurrency(currencyMap[data.country_code] || 'usd');
      })
      .catch(() => {
        setUserCountry('US');
        setPreferredCurrency('usd');
      });
  }, []);

  const plans: Plan[] = [
    {
      name: "Free",
      price: "$0",
      originalPrice: null,
      period: "forever",
      description: "Perfect for trying out FAQify",
      features: [
        "10 FAQ generations per month",
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
      cta: "Current Plan",
      popular: false,
      current: currentPlan === "Free",
      disabled: true
    },
    {
      name: "Pro",
      price: isAnnual ? "$97" : "$9",
      originalPrice: isAnnual ? "$108" : null,
      period: isAnnual ? "per year" : "per month",
      description: "Ideal for small businesses and content creators",
      features: [
        "100 FAQ generations per month",
        "Website URL analysis",
        "Text content analysis",
        "Document upload (PDF, DOCX)",
        "AI-powered FAQ generation",
        "Embed widget",
        "WordPress integration",
        "Analytics dashboard",
        "Export functionality",
        "Priority email support"
      ],
      limitations: [],
      cta: currentPlan === "Pro" ? "Current Plan" : "Upgrade to Pro",
      popular: true,
      current: currentPlan === "Pro",
      disabled: currentPlan === "Pro"
    },
    {
      name: "Business",
      price: isAnnual ? "$313" : "$29",
      originalPrice: isAnnual ? "$348" : null,
      period: isAnnual ? "per year" : "per month",
      description: "For agencies and large organizations",
      features: [
        "500 FAQ generations per month",
        "Website URL analysis",
        "Text content analysis",
        "Document upload (PDF, DOCX)",
        "AI-powered FAQ generation",
        "Embed widget",
        "WordPress integration",
        "Analytics dashboard",
        "Export functionality",
        "Priority support & phone support"
      ],
      limitations: [],
      cta: currentPlan === "Business" ? "Current Plan" : "Upgrade to Business",
      popular: false,
      current: currentPlan === "Business",
      disabled: currentPlan === "Business"
    }
  ];

  // Helper function to get price in user's currency
  const getPriceInCurrency = (usdPrice: number) => {
    const rates: { [key: string]: { rate: number; symbol: string } } = {
      'usd': { rate: 1, symbol: '$' },
      'inr': { rate: 83, symbol: '₹' },
      'eur': { rate: 0.85, symbol: '€' },
      'gbp': { rate: 0.75, symbol: '£' }
    };

    const currency = rates[preferredCurrency] || rates['usd'];
    const convertedPrice = Math.round(usdPrice * currency.rate);

    return {
      amount: convertedPrice,
      symbol: currency.symbol,
      currency: preferredCurrency.toUpperCase()
    };
  };

  // Razorpay payment handler
  const handleRazorpayPayment = async (planName: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to upgrade your plan.",
        variant: "destructive",
      });
      return;
    }

    if (!razorpayLoaded || !window.Razorpay) {
      toast({
        title: "Payment System Loading",
        description: "Please wait for the payment system to load and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setProcessingPlan(planName);

      console.log('Starting Razorpay payment for:', {
        planName,
        preferredCurrency,
        userCountry,
        razorpayLoaded,
        hasRazorpay: !!window.Razorpay
      });

      // Create Razorpay order
      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: {
          planId: planName,
          currency: preferredCurrency,
          userCountry: userCountry
        }
      });

      console.log('Razorpay order response:', { data, error });

      if (error) {
        console.error('Razorpay order creation error:', error);
        throw error;
      }

      if (!data.success || !data.order) {
        console.error('Invalid order response:', data);
        throw new Error('Failed to create payment order');
      }

      console.log('Order created successfully:', data.order);

      // Configure Razorpay options
      const options = {
        key: data.order.key,
        amount: data.order.amount,
        currency: data.order.currency.toUpperCase(),
        name: 'FAQify',
        description: `${data.plan.name} Plan Subscription`,
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
                description: `Welcome to ${data.plan.name} plan! Your subscription is now active.`,
              });

              // Refresh the page to show updated plan
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

      console.log('Razorpay options configured:', options);

      // Open Razorpay checkout
      const rzp = new window.Razorpay(options);
      console.log('Opening Razorpay checkout...');
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

  // Main upgrade handler
  const handleUpgrade = (planName: string) => {
    if (planName === "Free") return;
    handleRazorpayPayment(planName);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const savings = isAnnual ? "Save 10%" : null;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Upgrade Your Plan</h1>
        <p className="text-gray-400 mb-6">Choose the perfect plan for your FAQ generation needs</p>
        
        {/* Annual/Monthly Toggle */}
        <div className="flex items-center justify-center space-x-4 mb-8">
          <span className={`text-sm ${!isAnnual ? 'text-white' : 'text-gray-400'}`}>Monthly</span>
          <Switch
            checked={isAnnual}
            onCheckedChange={setIsAnnual}
            className="data-[state=checked]:bg-blue-600"
          />
          <span className={`text-sm ${isAnnual ? 'text-white' : 'text-gray-400'}`}>Annual</span>
          {savings && (
            <Badge className="bg-green-600/20 text-green-400 border-green-600/30 ml-2">
              {savings}
            </Badge>
          )}
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

              {!plan.current && plan.name !== "Free" && (
                <div className="mb-4 text-center">
                  <div className="flex items-center justify-center text-sm text-gray-400 mb-2">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Secure payment via Razorpay
                  </div>
                  <div className="text-xs text-gray-500">
                    Supports cards, UPI, wallets & international payments
                  </div>
                  {preferredCurrency !== 'usd' && (
                    <div className="text-xs text-gray-500 mt-1">
                      Showing prices in {preferredCurrency.toUpperCase()}
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={() => handleUpgrade(plan.name)}
                disabled={plan.disabled || processingPlan === plan.name || (!razorpayLoaded && plan.name !== "Free")}
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
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : !razorpayLoaded && plan.name !== "Free" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
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
                  <td className="py-3 text-gray-300">FAQ Generations per Month</td>
                  <td className="text-center py-3 text-white">10</td>
                  <td className="text-center py-3 text-white">100</td>
                  <td className="text-center py-3 text-white">500</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">Website URL Analysis</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">Text Content Analysis</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">Document Upload (PDF, DOCX)</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">AI-powered FAQ Generation</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">Embed Widget</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">WordPress Integration</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">Analytics Dashboard</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-3 text-gray-300">Export Functionality</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                  <td className="text-center py-3 text-green-400">✓</td>
                </tr>
                <tr>
                  <td className="py-3 text-gray-300">Support Level</td>
                  <td className="text-center py-3 text-white">Email</td>
                  <td className="text-center py-3 text-white">Priority Email</td>
                  <td className="text-center py-3 text-white">Priority + Phone</td>
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
          <div>
            <h4 className="text-white font-medium mb-2">How does the monthly FAQ limit work?</h4>
            <p className="text-gray-400 text-sm">Your FAQ generation limit resets every month. Each individual FAQ you generate counts toward your monthly limit, not collections.</p>
          </div>
          <div>
            <h4 className="text-white font-medium mb-2">Do all plans have the same features?</h4>
            <p className="text-gray-400 text-sm">Yes! All plans include the same powerful features. The only difference is the number of FAQs you can generate per month and support level.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
