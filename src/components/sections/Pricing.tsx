
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Zap, Crown, Loader2, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Declare Razorpay for TypeScript
declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  faq_limit: number;
  features: string[];
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: any) => void;
  prefill: {
    name: string;
    email: string;
  };
  theme: {
    color: string;
  };
  modal: {
    ondismiss: () => void;
  };
}

export const Pricing = () => {
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [userCountry, setUserCountry] = useState('US');
  const [preferredCurrency, setPreferredCurrency] = useState('usd');
  const { user } = useAuth();
  const { toast } = useToast();

  // Load Razorpay script
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

    // Detect user location (simplified)
    fetch('https://ipapi.co/json/')
      .then(response => response.json())
      .then(data => {
        setUserCountry(data.country_code || 'US');
        // Set preferred currency based on country
        const currencyMap: { [key: string]: string } = {
          'IN': 'inr',
          'GB': 'gbp',
          'DE': 'eur', 'FR': 'eur', 'IT': 'eur', 'ES': 'eur', 'NL': 'eur'
        };
        setPreferredCurrency(currencyMap[data.country_code] || 'usd');
      })
      .catch(() => {
        // Fallback to USD if location detection fails
        setUserCountry('US');
        setPreferredCurrency('usd');
      });
  }, []);

  // Static pricing plans with standardized features
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price_monthly: 0,
      faq_limit: 5,
      features: [
        'Website URL analysis',
        'Text content analysis',
        'Document upload (PDF, DOCX)',
        'AI-powered FAQ generation',
        'Embed widget',
        'WordPress integration',
        'Analytics dashboard',
        'Export functionality',
        'Email support'
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      price_monthly: 9,
      faq_limit: 100,
      features: [
        'Website URL analysis',
        'Text content analysis',
        'Document upload (PDF, DOCX)',
        'AI-powered FAQ generation',
        'Embed widget',
        'WordPress integration',
        'Analytics dashboard',
        'Export functionality',
        'Priority email support'
      ]
    },
    {
      id: 'business',
      name: 'Business',
      price_monthly: 29,
      faq_limit: 500,
      features: [
        'Website URL analysis',
        'Text content analysis',
        'Document upload (PDF, DOCX)',
        'AI-powered FAQ generation',
        'Embed widget',
        'WordPress integration',
        'Analytics dashboard',
        'Export functionality',
        'Priority support & phone support'
      ]
    }
  ];

  // Razorpay payment handler
  const handleRazorpayPayment = async (planId: string) => {
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
      setProcessingPlan(planId);

      // Create Razorpay order
      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: {
          planId: planId,
          currency: preferredCurrency,
          userCountry: userCountry
        }
      });

      if (error) throw error;

      if (!data.success || !data.order) {
        throw new Error('Failed to create payment order');
      }

      // Configure Razorpay options
      const options: RazorpayOptions = {
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

              // Redirect to dashboard
              setTimeout(() => {
                window.location.href = '/dashboard?upgrade=success';
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

      // Open Razorpay checkout
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

  // Stripe payment handler (preserved for backward compatibility)
  const handleStripePayment = async (planId: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to upgrade your plan.",
        variant: "destructive",
      });
      return;
    }

    try {
      setProcessingPlan(planId);

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          planId: planId,
          successUrl: `${window.location.origin}/dashboard?upgrade=success`,
          cancelUrl: `${window.location.origin}/pricing`
        }
      });

      if (error) throw error;

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: "Upgrade Failed",
        description: "Failed to start upgrade process. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessingPlan(null);
    }
  };

  // Main upgrade handler - uses Razorpay by default
  const handleUpgrade = (planId: string) => {
    handleRazorpayPayment(planId);
  };

  // Helper function to always show USD pricing
  const getPriceInCurrency = (usdPrice: number) => {
    // Always return USD pricing regardless of user location
    return {
      amount: usdPrice,
      symbol: '$',
      currency: 'USD'
    };
  };



  return (
    <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">
            Simple, Transparent
            <span className="text-blue-500"> Pricing</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Choose the perfect plan for your FAQ generation needs. Start free, upgrade anytime.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
            const isPopular = plan.name === 'Pro';
            const isFree = plan.name === 'Free';
            const features = plan.features;

            return (
              <Card
                key={plan.id}
                className={`relative bg-black/50 border-gray-800 hover:border-blue-500/50 transition-all duration-300 hover:transform hover:scale-105 ${
                  isPopular ? 'ring-2 ring-blue-500/50 border-blue-500' : ''
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="flex items-center space-x-1 bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
                      <Star className="h-4 w-4" />
                      <span>Most Popular</span>
                    </div>
                  </div>
                )}

                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl text-white mb-2">{plan.name}</CardTitle>
                  <div className="mb-4">
                    {(() => {
                      if (plan.price_monthly === 0) {
                        return (
                          <>
                            <span className="text-4xl font-bold text-white">Free</span>
                            <span className="text-gray-400 ml-2">forever</span>
                          </>
                        );
                      }

                      const price = getPriceInCurrency(plan.price_monthly);
                      return (
                        <>
                          <span className="text-4xl font-bold text-white">
                            ${price.amount}
                          </span>
                          <span className="text-gray-400 ml-2">/month</span>
                        </>
                      );
                    })()}
                  </div>
                  <CardDescription className="text-gray-400">
                    {plan.faq_limit} FAQ generations per month
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {features.map((feature: string, featureIndex: number) => (
                      <li key={featureIndex} className="flex items-start space-x-3">
                        <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-300">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {!isFree && (
                    <div className="mb-4 text-center">
                      <div className="flex items-center justify-center text-sm text-gray-400 mb-2">
                        <CreditCard className="h-4 w-4 mr-2" />
                        Secure payment via Razorpay
                      </div>
                      <div className="text-xs text-gray-500">
                        Supports cards, UPI, wallets & international payments
                      </div>
                    </div>
                  )}

                  {isFree ? (
                    <Link to="/signup" className="block">
                      <Button className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600">
                        Start Free
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={processingPlan === plan.id || !razorpayLoaded}
                      className={`w-full py-3 ${
                        isPopular
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-600'
                      }`}
                    >
                      {processingPlan === plan.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Processing...
                        </>
                      ) : !razorpayLoaded ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Loading Payment...
                        </>
                      ) : (
                        `Choose ${plan.name}`
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        <div className="text-center mt-12">
          <p className="text-gray-400">
            Need a custom solution?{" "}
            <Link to="/contact" className="text-blue-400 hover:text-blue-300">
              Contact us
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
};
