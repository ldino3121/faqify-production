
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, FileText, Upload, Code, Brain, Shield } from "lucide-react";

export const Features = () => {
  const features = [
    {
      icon: Globe,
      title: "Website Crawling",
      description: "Automatically analyze any website or blog post URL to extract content and generate relevant FAQs.",
    },
    {
      icon: FileText,
      title: "Text Analysis",
      description: "Paste any text content directly and let our AI create comprehensive FAQ sections instantly.",
    },
    {
      icon: Upload,
      title: "Document Upload",
      description: "Upload PDF, DOCX, and other document formats to generate FAQs from your existing content.",
    },
    {
      icon: Code,
      title: "Searchable Embed Widget",
      description: "Drop a searchable, on-brand FAQ widget on WordPress or any site with one line of code — answering questions where visitors convert.",
    },
    {
      icon: Brain,
      title: "Support Deflection",
      description: "AI-written answers to real customer questions, so fewer tickets land in your inbox and more visitors self-serve.",
    },
    {
      icon: Shield,
      title: "Secure & Reliable",
      description: "Enterprise-grade security with reliable performance and data protection for all users.",
    },
  ];

  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900/50">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">
            Answer Questions,
            <span className="text-blue-500"> Not Tickets</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Everything you need to convert more of the traffic you already have — and keep support load from growing with it
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="bg-black/50 border-gray-800 hover:border-blue-500/50 transition-all duration-300 hover:transform hover:scale-105">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-600/10 rounded-lg border border-blue-600/20">
                    <feature.icon className="h-6 w-6 text-blue-400" />
                  </div>
                  <CardTitle className="text-white">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-400 leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
