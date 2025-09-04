
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Upload, Brain, Code, Globe } from "lucide-react";

export const HowItWorks = () => {
  const steps = [
    {
      icon: Upload,
      title: "Input Your Content",
      description: "Enter a website URL, paste text directly, or upload documents (PDF, DOCX) for analysis.",
      step: "01"
    },
    {
      icon: Brain,
      title: "AI Processes Content",
      description: "Our advanced AI analyzes your content and identifies the most common questions and concerns.",
      step: "02"
    },
    {
      icon: Globe,
      title: "Generate FAQs",
      description: "Get professionally written FAQ sections with clear, concise answers in seconds.",
      step: "03"
    },
    {
      icon: Code,
      title: "Embed Anywhere",
      description: "Copy the widget code and paste it into your WordPress site or any other platform.",
      step: "04"
    }
  ];

  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900/30">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">
            How FAQify
            <span className="text-blue-500"> Works</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            From content to FAQ widget in just 4 simple steps. No technical knowledge required.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              <Card className="bg-black/50 border-gray-800 hover:border-blue-500/50 transition-all duration-300 h-full">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 relative">
                    <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs font-bold rounded-full w-8 h-8 flex items-center justify-center">
                      {step.step}
                    </div>
                    <div className="p-4 bg-blue-600/10 rounded-lg border border-blue-600/20 inline-block">
                      <step.icon className="h-8 w-8 text-blue-400" />
                    </div>
                  </div>
                  <CardTitle className="text-white text-lg">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-400 text-center leading-relaxed">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
              
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                  <ArrowRight className="h-6 w-6 text-blue-500" />
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
