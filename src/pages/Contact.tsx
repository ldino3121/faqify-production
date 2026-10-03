import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Clock, Send, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Contact = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot: real users never fill this field in.
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setFormError(null);

    const problems: string[] = [];
    if (name.trim().length < 2) problems.push("your name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) problems.push("a valid email address");
    if (message.trim().length < 10 || message.trim().length > 5000) {
      problems.push("a message of 10–5000 characters");
    }
    if (problems.length) {
      setFormError(`Please provide ${problems.join(", ")}.`);
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-contact", {
        body: {
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          website,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      console.error("Contact form submit failed:", err);
      setFormError(
        "Sorry — we could not send your message. Please email faqify18@gmail.com instead.",
      );
    } finally {
      setSending(false);
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
              Contact <span className="text-blue-500">Us</span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
              Have questions about FAQify? Need help with your FAQ generation? 
              We're here to help you succeed with your customer support goals.
            </p>
          </div>
        </section>

        {/* Contact Form */}
        <section className="py-8 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold text-white mb-2">Send us a message</h2>
                <p className="text-gray-400 mb-6">
                  We reply to every message within 24 hours.
                </p>

                {sent ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-white text-xl font-semibold mb-2">Message sent</h3>
                    <p className="text-gray-400 max-w-md">
                      Thanks for reaching out — a copy is on its way to your inbox
                      and our team will reply shortly.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="contact-name" className="text-gray-300">Name</Label>
                        <Input
                          id="contact-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Jane Doe"
                          className="bg-black border-gray-700 text-white"
                          required
                          autoComplete="name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-email" className="text-gray-300">Email</Label>
                        <Input
                          id="contact-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="jane@company.com"
                          className="bg-black border-gray-700 text-white"
                          required
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contact-subject" className="text-gray-300">
                        Subject <span className="text-gray-500 font-normal">(optional)</span>
                      </Label>
                      <Input
                        id="contact-subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Billing question"
                        className="bg-black border-gray-700 text-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contact-message" className="text-gray-300">Message</Label>
                      <Textarea
                        id="contact-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Tell us how we can help…"
                        rows={6}
                        maxLength={5000}
                        className="bg-black border-gray-700 text-white"
                        required
                      />
                      <p className="text-xs text-gray-500 text-right">{message.length}/5000</p>
                    </div>

                    {/* Honeypot: hidden from humans, bots routinely fill it in. */}
                    <div
                      aria-hidden="true"
                      className="absolute -left-[9999px] h-px w-px overflow-hidden"
                    >
                      <Label htmlFor="contact-website">Website</Label>
                      <Input
                        id="contact-website"
                        name="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                      />
                    </div>

                    {formError && (
                      <p role="alert" className="text-sm text-red-400">
                        {formError}
                      </p>
                    )}

                    <Button type="submit" disabled={sending} className="w-full md:w-auto">
                      {sending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      {sending ? "Sending…" : "Send message"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
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
