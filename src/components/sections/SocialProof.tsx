
import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, Clock, Users, MessageSquare, BarChart3, CheckCircle } from "lucide-react";

export const SocialProof = () => {
  const benefits = [
    {
      icon: TrendingDown,
      title: "Reduce Support Tickets",
      description: "Well-crafted FAQs can reduce customer support inquiries by up to 60%, allowing your team to focus on complex issues.",
      stat: "60%",
      statLabel: "Fewer Support Tickets"
    },
    {
      icon: Clock,
      title: "Faster Resolution Times",
      description: "Customers find answers instantly instead of waiting for support responses, improving satisfaction and reducing frustration.",
      stat: "24/7",
      statLabel: "Instant Answers"
    },
    {
      icon: Users,
      title: "Better User Experience",
      description: "Comprehensive FAQs help users understand your product better, leading to higher engagement and conversion rates.",
      stat: "85%",
      statLabel: "User Satisfaction"
    }
  ];

  const impactStats = [
    {
      number: "60%",
      label: "Average reduction in support tickets",
      description: "When comprehensive FAQs are implemented"
    },
    {
      number: "3x",
      label: "Faster problem resolution",
      description: "Users find answers immediately vs waiting for support"
    },
    {
      number: "40%",
      label: "Increase in user satisfaction",
      description: "Self-service options improve customer experience"
    },
    {
      number: "24/7",
      label: "Always available support",
      description: "FAQs provide instant help around the clock"
    }
  ];

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900/30">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">
            Why FAQs
            <span className="text-blue-500"> Matter</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-8">
            Implementing comprehensive FAQ sections transforms customer support and user experience.
            Here's the real impact on your business.
          </p>
        </div>

        {/* Impact Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {impactStats.map((stat, index) => (
            <Card key={index} className="bg-black/50 border-gray-800 text-center">
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-blue-400 mb-2">{stat.number}</div>
                <div className="text-white font-medium mb-2">{stat.label}</div>
                <div className="text-gray-400 text-sm">{stat.description}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {benefits.map((benefit, index) => (
            <Card key={index} className="bg-black/50 border-gray-800 hover:border-blue-500/50 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <benefit.icon className="h-8 w-8 text-blue-500" />
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-400">{benefit.stat}</div>
                    <div className="text-xs text-gray-400">{benefit.statLabel}</div>
                  </div>
                </div>

                <h3 className="text-xl font-semibold text-white mb-3">{benefit.title}</h3>
                <p className="text-gray-300 leading-relaxed">{benefit.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quote Section */}
        <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-8 text-center">
          <MessageSquare className="h-12 w-12 text-blue-400 mx-auto mb-4" />
          <blockquote className="text-xl text-gray-300 mb-4 max-w-3xl mx-auto italic">
            "Companies that implement comprehensive FAQ sections see an average 60% reduction in support tickets,
            allowing support teams to focus on complex issues while customers get instant answers to common questions."
          </blockquote>
          <div className="flex items-center justify-center space-x-2 text-gray-400">
            <BarChart3 className="h-4 w-4" />
            <span className="text-sm">Customer Support Industry Research</span>
          </div>
        </div>

      </div>
    </section>
  );
};
