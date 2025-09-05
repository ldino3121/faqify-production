
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, Briefcase, GraduationCap, Heart, Building, Gamepad2 } from "lucide-react";

export const IndustryExamples = () => {
  const examples = [
    {
      icon: Store,
      industry: "E-commerce",
      title: "Online Retail Store",
      description: "Generated comprehensive FAQs covering shipping policies, returns, product information, and customer support for a fashion retailer.",
      results: "40% reduction in support tickets",
      tags: ["Shipping", "Returns", "Sizing"]
    },
    {
      icon: Briefcase,
      industry: "SaaS",
      title: "Software Platform",
      description: "Created detailed FAQs for a project management tool, covering features, pricing, integrations, and troubleshooting.",
      results: "60% faster customer onboarding",
      tags: ["Features", "Pricing", "API"]
    },
    {
      icon: GraduationCap,
      industry: "Education",
      title: "Online Course Platform",
      description: "Developed student-focused FAQs covering enrollment, course access, certificates, and technical requirements.",
      results: "50% less admin workload",
      tags: ["Enrollment", "Certificates", "Technical"]
    },
    {
      icon: Heart,
      industry: "Healthcare",
      title: "Medical Practice",
      description: "Generated patient-friendly FAQs about services, appointments, insurance, and preparation for procedures.",
      results: "Better patient satisfaction",
      tags: ["Appointments", "Insurance", "Services"]
    },
    {
      icon: Building,
      industry: "Real Estate",
      title: "Property Agency",
      description: "Created comprehensive FAQs covering buying process, financing, property management, and legal requirements.",
      results: "35% more qualified leads",
      tags: ["Buying", "Financing", "Legal"]
    },
    {
      icon: Gamepad2,
      industry: "Gaming",
      title: "Game Development Studio",
      description: "Built player-focused FAQs covering gameplay, technical issues, updates, and community guidelines.",
      results: "Improved player retention",
      tags: ["Gameplay", "Updates", "Community"]
    }
  ];

  return (
    <section id="examples" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">
            Real-World
            <span className="text-blue-500"> Success Stories</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            See how businesses across different industries use FAQify to improve customer experience
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {examples.map((example, index) => (
            <Card key={index} className="bg-black/50 border-gray-800 hover:border-blue-500/50 transition-all duration-300 hover:transform hover:scale-105">
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-600/10 rounded-lg border border-blue-600/20">
                      <example.icon className="h-6 w-6 text-blue-400" />
                    </div>
                    <Badge variant="secondary" className="bg-gray-800 text-gray-300">
                      {example.industry}
                    </Badge>
                  </div>
                </div>
                <CardTitle className="text-white text-lg">{example.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription className="text-gray-400 leading-relaxed">
                  {example.description}
                </CardDescription>
                
                <div className="flex flex-wrap gap-2">
                  {example.tags.map((tag, tagIndex) => (
                    <Badge key={tagIndex} variant="outline" className="border-blue-600/30 text-blue-400 text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                
                <div className="pt-2 border-t border-gray-800">
                  <p className="text-green-400 font-medium text-sm">
                    ✓ {example.results}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="text-center mt-16">
          <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-8 max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-white mb-4">Ready to Transform Your Customer Support?</h3>
            <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
              Start creating professional FAQ sections that reduce support workload and improve customer satisfaction.
              No matter your industry, FAQify adapts to your content and audience.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
              <div className="flex items-center space-x-2 text-green-400">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">10 Free FAQs</span>
              </div>
              <div className="flex items-center space-x-2 text-green-400">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">No Credit Card Required</span>
              </div>
              <div className="flex items-center space-x-2 text-green-400">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">Setup in Minutes</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
