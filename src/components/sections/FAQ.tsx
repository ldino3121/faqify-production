
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { FREE_FAQ_LIMIT } from "@/config/plans";

export const FAQ = () => {
  const [openItems, setOpenItems] = useState<number[]>([0]);

  const faqs = [
    {
      question: "How does FAQify generate FAQs?",
      answer: "FAQify uses advanced AI technology to analyze your content from websites, documents, or text input. It identifies common questions your audience might have and generates clear, professional answers based on your content."
    },
    {
      question: "What types of content can I input?",
      answer: "You can input website URLs, paste text directly, or upload documents (PDF, DOCX, TXT). Our AI can process various content types including blog posts, product descriptions, documentation, and more."
    },
    {
      question: "How do I embed FAQs on my WordPress site?",
      answer: "After generating your FAQs, you'll get a simple embed code. Just copy and paste this code into your WordPress page or post where you want the FAQs to appear. No technical knowledge required!"
    },
    {
      question: "Can I edit the generated FAQs?",
      answer: "Absolutely! All generated FAQs can be edited, reordered, or customized to match your brand voice. You have full control over the final output."
    },
    {
      question: "How do credit packs work?",
      answer: `Every account starts with ${FREE_FAQ_LIMIT} FAQ credits once. Pro adds 100 credits for $9 one time, and Business adds 500 for $29 one time. One credit saves one AI-generated question-and-answer pair. Purchased credits accumulate, never expire on a schedule, and do not renew automatically. Applicable taxes are added at checkout.`
    },
    {
      question: "Is there a limit to how long my content can be?",
      answer: "FAQ generation has input, request-rate, and storage limits. Credit packs do not promise unlimited hosting. Existing FAQ edits, exports, and embeds remain available when credits reach zero."
    },
    {
      question: "Can I use FAQify for clients?",
      answer: "Yes. You can buy either credit pack as needed and organize generated FAQs in collections for different clients. Published embed appearance remains configurable per widget."
    },
    {
      question: "How accurate are the AI-generated answers?",
      answer: "Our AI is highly accurate as it bases answers strictly on your provided content. However, we always recommend reviewing and editing the output to ensure it matches your brand voice and specific requirements."
    }
  ];

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">
            Frequently Asked
            <span className="text-blue-500"> Questions</span>
          </h2>
          <p className="text-xl text-gray-400">
            Everything you need to know about FAQify
          </p>
        </div>
        
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <Card key={index} className="bg-black/50 border-gray-800 hover:border-blue-500/50 transition-all duration-300">
              <CardContent className="p-0">
                <button
                  onClick={() => toggleItem(index)}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-900/50 transition-colors"
                >
                  <h3 className="text-lg font-medium text-white pr-4">
                    {faq.question}
                  </h3>
                  {openItems.includes(index) ? (
                    <ChevronUp className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                
                {openItems.includes(index) && (
                  <div className="px-6 pb-6">
                    <div className="border-t border-gray-800 pt-4">
                      <p className="text-gray-300 leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="text-center mt-12">
          <p className="text-gray-400 mb-4">
            Still have questions? We're here to help!
          </p>
          <Link to="/contact" className="text-blue-400 hover:text-blue-300 underline">
            Contact Us
          </Link>
        </div>
      </div>
    </section>
  );
};
