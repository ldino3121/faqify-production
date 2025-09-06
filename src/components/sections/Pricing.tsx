
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Zap, Crown, Loader2, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useRazorpaySubscription } from "@/hooks/useRazorpaySubscription";

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
  const [paymentType, setPaymentType] = useState<'one_time' | 'subscription'>('subscription');
  const [locationData, setLocationData] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();
  const { createAndOpenSubscription, loading: subscriptionLoading } = useRazorpaySubscription();

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

    // Enhanced location detection with payment methods
    const detectLocationAndPaymentMethods = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();

        setLocationData(data);
        setUserCountry(data.country_code || 'US');

        // Set preferred currency based on country
        const currencyMap: { [key: string]: string } = {
          'IN': 'inr',
          'GB': 'gbp',
          'DE': 'eur', 'FR': 'eur', 'IT': 'eur', 'ES': 'eur', 'NL': 'eur',
          'AU': 'aud', 'CA': 'cad', 'JP': 'jpy', 'SG': 'sgd'
        };
        setPreferredCurrency(currencyMap[data.country_code] || 'usd');

        // Set available payment methods based on country
        const paymentMethodsMap: { [key: string]: string[] } = {
          'IN': ['cards', 'upi', 'netbanking', 'wallets', 'emi'],
          'US': ['cards', 'paypal', 'apple_pay', 'google_pay'],
          'GB': ['cards', 'paypal', 'apple_pay', 'google_pay'],
          'DE': ['cards', 'paypal', 'sofort', 'giropay'],
          'FR': ['cards', 'paypal', 'apple_pay'],
          'AU': ['cards', 'paypal', 'apple_pay'],
          'CA': ['cards', 'paypal', 'apple_pay'],
          'SG': ['cards', 'paypal', 'grabpay'],
          'MY': ['cards', 'paypal', 'grabpay', 'fpx'],
          'TH': ['cards', 'paypal', 'truemoney'],
        };

        setPaymentMethods(paymentMethodsMap[data.country_code] || ['cards', 'paypal']);

        console.log('Location detected:', {
          country: data.country_code,
          currency: currencyMap[data.country_code] || 'usd',
          paymentMethods: paymentMethodsMap[data.country_code] || ['cards', 'paypal']
        });

      } catch (error) {
        console.error('Location detection failed:', error);
        // Fallback to US defaults
        setUserCountry('US');
        setPreferredCurrency('usd');
        setPaymentMethods(['cards', 'paypal']);
      }
    };

    detectLocationAndPaymentMethods();
  }, []);

  // Static pricing plans with standardized features
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price_monthly: 0,
      faq_limit: 5, // Free plan: 5 FAQs per month
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

      // Handle subscription vs one-time payment
      if (paymentType === 'subscription') {
        // Use Razorpay subscription
        const result = await createAndOpenSubscription(planId as 'Pro' | 'Business');
        if (!result.success) {
          throw new Error(result.error || 'Failed to create subscription');
        }
        return; // Subscription flow handles the rest
      }

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

      // Configure Razorpay options with location-specific settings
      const options: RazorpayOptions = {
        key: data.order.key,
        amount: data.order.amount,
        currency: data.order.currency.toUpperCase(),
        name: 'FAQify',
        description: `${data.plan.name} Plan ${paymentType === 'subscription' ? 'Subscription' : 'Upgrade'}`,
        order_id: data.order.id,
        // Location-specific payment method preferences
        method: userCountry === 'IN' ? {
          upi: paymentMethods.includes('upi'),
          card: paymentMethods.includes('cards'),
          netbanking: paymentMethods.includes('netbanking'),
          wallet: paymentMethods.includes('wallets'),
          emi: paymentMethods.includes('emi')
        } : {
          card: true
        },
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
          email: data.user.email,
          contact: data.user.phone || '',
          ...(locationData && {
            'billing_address[country]': locationData.country_code,
            'billing_address[state]': locationData.region,
            'billing_address[city]': locationData.city,
            'billing_address[postal_code]': locationData.postal
          })
        },
        theme: {
          color: '#3B82F6'
        },
        config: {
          display: {
            language: userCountry === 'IN' ? 'en' : 'en'
          }
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

          {/* Payment Type Toggle */}
          <div className="mt-8 flex items-center justify-center space-x-4">
            <span className="text-gray-400">Payment Type:</span>
            <div className="flex items-center space-x-2 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setPaymentType('subscription')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  paymentType === 'subscription'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                🔄 Auto-Renewal Subscription
              </button>
              <button
                onClick={() => setPaymentType('one_time')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  paymentType === 'one_time'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                💳 One-Time Payment
              </button>
            </div>
          </div>

          {/* Payment Type Description */}
          <div className="mt-4 text-sm text-gray-500 max-w-lg mx-auto">
            {paymentType === 'subscription' ? (
              <p>✅ Automatic monthly renewal • Cancel anytime • Managed via Razorpay</p>
            ) : (
              <p>💡 Pay once for 30 days • Manual renewal required • No auto-billing</p>
            )}
          </div>

          {/* Location-Based Payment Methods */}
          {locationData && paymentMethods.length > 0 && (
            <div className="mt-6 p-4 bg-gray-800/50 rounded-lg max-w-2xl mx-auto">
              <div className="flex items-center justify-center space-x-2 mb-3">
                <span className="text-sm text-gray-400">
                  Available in {locationData.country_name || userCountry}:
                </span>
              </div>
              <div className="flex items-center justify-center space-x-4 flex-wrap gap-2">
                {paymentMethods.map((method) => {
                  const methodIcons: { [key: string]: string } = {
                    'cards': '💳',
                    'upi': '📱',
                    'netbanking': '🏦',
                    'wallets': '👛',
                    'emi': '📊',
                    'paypal': '🅿️',
                    'apple_pay': '🍎',
                    'google_pay': '🔵',
                    'sofort': '⚡',
                    'giropay': '🇩🇪',
                    'grabpay': '🚗',
                    'fpx': '🏦',
                    'truemoney': '💰'
                  };

                  const methodNames: { [key: string]: string } = {
                    'cards': 'Cards',
                    'upi': 'UPI',
                    'netbanking': 'Net Banking',
                    'wallets': 'Wallets',
                    'emi': 'EMI',
                    'paypal': 'PayPal',
                    'apple_pay': 'Apple Pay',
                    'google_pay': 'Google Pay',
                    'sofort': 'Sofort',
                    'giropay': 'Giropay',
                    'grabpay': 'GrabPay',
                    'fpx': 'FPX',
                    'truemoney': 'TrueMoney'
                  };

                  return (
                    <div key={method} className="flex items-center space-x-1 text-xs text-gray-300 bg-gray-700 px-2 py-1 rounded">
                      <span>{methodIcons[method] || '💳'}</span>
                      <span>{methodNames[method] || method}</span>
                    </div>
                  );
                })}
              </div>
              {userCountry === 'IN' && (
                <div className="mt-2 text-xs text-blue-400 text-center">
                  🇮🇳 Special support for Indian payment methods via Razorpay
                </div>
              )}
            </div>
          )}
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
                    <strong>{plan.faq_limit} FAQ generations</strong> per month
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
                        {userCountry === 'IN' ? (
                          'Cards, UPI, Net Banking, Wallets & EMI'
                        ) : userCountry === 'US' ? (
                          'Cards, PayPal, Apple Pay & Google Pay'
                        ) : (
                          'Cards, PayPal & local payment methods'
                        )}
                      </div>
                      {locationData && (
                        <div className="text-xs text-blue-400 mt-1">
                          📍 {locationData.country_name} • {preferredCurrency.toUpperCase()}
                        </div>
                      )}
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
                        paymentType === 'subscription'
                          ? `Subscribe to ${plan.name}`
                          : `Choose ${plan.name}`
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
