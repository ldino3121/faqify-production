import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, MessageSquare, Clock, MapPin, Phone, Send, Loader2 } from "lucide-react";

const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Message Sent!",
        description: "Thank you for contacting us. We'll get back to you within 24 hours.",
      });

      // Reset form
      setFormData({
        name: "",
        email: "",
        subject: "",
        message: ""
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      
      <main className="pt-20">
        {/* Hero Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Get in <span className="text-blue-500">Touch</span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
              Have questions about FAQify? Need help with your FAQ generation? 
              We're here to help you succeed with your customer support goals.
            </p>
          </div>
        </section>

        {/* Contact Form and Info */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Contact Form */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <MessageSquare className="h-6 w-6 mr-2 text-blue-500" />
                    Send us a Message
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                          Name *
                        </label>
                        <Input
                          id="name"
                          name="name"
                          type="text"
                          required
                          value={formData.name}
                          onChange={handleChange}
                          className="bg-gray-800 border-gray-700 text-white"
                          placeholder="Your full name"
                        />
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                          Email *
                        </label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          required
                          value={formData.email}
                          onChange={handleChange}
                          className="bg-gray-800 border-gray-700 text-white"
                          placeholder="your@email.com"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="subject" className="block text-sm font-medium text-gray-300 mb-2">
                        Subject *
                      </label>
                      <Input
                        id="subject"
                        name="subject"
                        type="text"
                        required
                        value={formData.subject}
                        onChange={handleChange}
                        className="bg-gray-800 border-gray-700 text-white"
                        placeholder="What can we help you with?"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                        Message *
                      </label>
                      <Textarea
                        id="message"
                        name="message"
                        required
                        value={formData.message}
                        onChange={handleChange}
                        className="bg-gray-800 border-gray-700 text-white min-h-[120px]"
                        placeholder="Tell us more about your question or how we can help..."
                      />
                    </div>
                    
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send Message
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <div className="space-y-8">
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <Mail className="h-6 w-6 text-blue-500 mt-1" />
                      <div>
                        <h3 className="text-white font-semibold mb-2">Email Support</h3>
                        <p className="text-gray-400 mb-2">Get help with your account, billing, or technical questions.</p>
                        <a href="mailto:support@faqify.com" className="text-blue-400 hover:text-blue-300">
                          support@faqify.com
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <Clock className="h-6 w-6 text-blue-500 mt-1" />
                      <div>
                        <h3 className="text-white font-semibold mb-2">Response Time</h3>
                        <p className="text-gray-400 mb-2">We typically respond to all inquiries within 24 hours.</p>
                        <p className="text-blue-400">Monday - Friday: 9 AM - 6 PM EST</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <MessageSquare className="h-6 w-6 text-blue-500 mt-1" />
                      <div>
                        <h3 className="text-white font-semibold mb-2">Live Chat</h3>
                        <p className="text-gray-400 mb-2">For immediate assistance, use our live chat feature.</p>
                        <p className="text-blue-400">Available in your dashboard</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
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
