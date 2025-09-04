import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Clock } from "lucide-react";

const Contact = () => {

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      
      <main className="pt-20">
        {/* Hero Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Contact <span className="text-blue-500">Us</span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
              Have questions about FAQify? Need help with your FAQ generation? 
              We're here to help you succeed with your customer support goals.
            </p>
          </div>
        </section>

        {/* Contact Information */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <Mail className="h-8 w-8 text-blue-500 mt-1" />
                    <div>
                      <h3 className="text-white font-semibold mb-3 text-xl">Email Support</h3>
                      <p className="text-gray-400 mb-4 text-lg">Get help with your account, billing, or technical questions.</p>
                      <a href="mailto:faqify18@gmail.com" className="text-blue-400 hover:text-blue-300 text-lg font-medium">
                        faqify18@gmail.com
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <Clock className="h-8 w-8 text-blue-500 mt-1" />
                    <div>
                      <h3 className="text-white font-semibold mb-3 text-xl">Response Time</h3>
                      <p className="text-gray-400 mb-4 text-lg">We typically respond to all inquiries within 24 hours.</p>
                      <p className="text-blue-400 text-lg font-medium">Monday - Friday: 9 AM - 6 PM EST</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/20">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6">
                  <h3 className="text-white font-semibold mb-2">How quickly can I get started with FAQify?</h3>
                  <p className="text-gray-400">
                    You can start generating FAQs immediately after signing up. Our AI-powered system can analyze 
                    your content and create professional FAQ sections in minutes.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6">
                  <h3 className="text-white font-semibold mb-2">Do you offer custom integrations?</h3>
                  <p className="text-gray-400">
                    Yes! We offer custom integrations for enterprise clients. Contact our sales team to discuss 
                    your specific requirements and integration needs.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6">
                  <h3 className="text-white font-semibold mb-2">What kind of support do you provide?</h3>
                  <p className="text-gray-400">
                    We provide comprehensive support including email support, live chat, documentation, 
                    and video tutorials to help you get the most out of FAQify.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
