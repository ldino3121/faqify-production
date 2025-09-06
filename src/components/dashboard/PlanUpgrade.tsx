import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  const [isAnnual, setIsAnnual] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanType>("Free");
  const [paymentType, setPaymentType] = useState<'one_time' | 'subscription'>('subscription');
  const { toast } = useToast();

  const plans: Plan[] = [
    {
      name: "Free",
      price: isAnnual ? "$0" : "$0",
      originalPrice: null,
      period: isAnnual ? "per year" : "forever",
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
      cta: currentPlan === "Free" ? "Current Plan" : "Downgrade",
      popular: false,
      current: currentPlan === "Free",
      disabled: currentPlan === "Free"
    },
    {
      name: "Pro",
      price: isAnnual ? "$90" : "$9",
      originalPrice: isAnnual ? "$108" : null,
      period: isAnnual ? "per year" : "per month",
      description: "Ideal for small businesses and bloggers",
      features: [
        "500 FAQ generations per month",
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
      disabled: currentPlan === "Pro"
    },
    {
      name: "Business",
      price: isAnnual ? "$290" : "$29",
      originalPrice: isAnnual ? "$348" : null,
      period: isAnnual ? "per year" : "per month",
      description: "For agencies and large websites",
      features: [
        "2,500 FAQ generations per month",
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
      disabled: currentPlan === "Business"
    }
  ];

  const handleUpgrade = (planName: string) => {
    if (planName === "Free") return;
    
    toast({
      title: `Upgrading to ${planName}`,
      description: "Redirecting to secure payment gateway...",
    });
    
    // Simulate payment redirect
    setTimeout(() => {
      toast({
        title: "Payment Successful!",
        description: `Welcome to ${planName}! Your new features are now active.`,
      });
      setCurrentPlan(planName as PlanType);
    }, 2000);
  };

  const savings = isAnnual ? "Save 17%" : null;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Upgrade Your Plan</h1>
        <p className="text-gray-400 mb-6">Choose the perfect plan for your FAQ generation needs</p>
        
        {/* Annual/Monthly Toggle */}
        <div className="flex items-center justify-center space-x-4 mb-6">
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
                disabled={plan.disabled}
                className={`w-full py-3 ${
                  plan.current
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : plan.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-600'
                }`}
              >
                {plan.current ? (
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
