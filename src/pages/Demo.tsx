
import { ArrowLeft, Copy, Check, Globe, FileText, Upload, Loader2, Play, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const Demo = () => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("url");
  const [urlInput, setUrlInput] = useState("https://example.com/about");
  const [textInput, setTextInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFAQs, setGeneratedFAQs] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const { toast } = useToast();

  // Use production URL for widget script, not localhost
  const baseUrl = window.location.origin.includes('localhost')
    ? 'https://faqify-ai-spark.netlify.app' // Replace with your actual production domain
    : window.location.origin;

  const embedCode = `<!-- FAQify Widget -->
<div data-faqify-collection="your-collection-id" data-faqify-theme="light"></div>
<script src="${baseUrl}/widget.js"></script>`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const demoFAQs = [
    {
      question: "What services does your company provide?",
      answer: "We provide comprehensive digital marketing solutions including SEO, social media management, content creation, and paid advertising campaigns to help businesses grow their online presence."
    },
    {
      question: "How long does it take to see results?",
      answer: "Results vary depending on the service, but typically you can expect to see initial improvements within 30-60 days for SEO, and immediate results for paid advertising campaigns."
    },
    {
      question: "Do you offer custom packages?",
      answer: "Yes, we create customized packages tailored to your specific business needs and budget. Contact us for a free consultation to discuss your requirements."
    },
    {
      question: "What is your pricing structure?",
      answer: "Our pricing is based on the scope of services and your business size. We offer flexible monthly packages starting from $500/month, with enterprise solutions available for larger organizations."
    }
  ];

  const simulateGeneration = async () => {
    if (activeTab === "url" && !urlInput.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a website URL to analyze.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "text" && !textInput.trim()) {
      toast({
        title: "Text Required",
        description: "Please enter some text content to analyze.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "upload" && !uploadedFile) {
      toast({
        title: "File Required",
        description: "Please upload a file to analyze.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setShowResults(false);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    setGeneratedFAQs(demoFAQs);
    setIsGenerating(false);
    setShowResults(true);

    let sourceDescription = "";
    if (activeTab === "url") {
      sourceDescription = "website content";
    } else if (activeTab === "text") {
      sourceDescription = "text content";
    } else if (activeTab === "upload") {
      sourceDescription = `uploaded file (${uploadedFile?.name})`;
    }

    toast({
      title: "FAQs Generated!",
      description: `Successfully generated ${demoFAQs.length} FAQ pairs from your ${sourceDescription}.`,
    });
  };

  const sampleFAQs = [
    {
      question: "What is an IPO?",
      answer: "An Initial Public Offering (IPO) is the process by which a private company goes public by selling its shares to institutional and retail investors for the first time."
    },
    {
      question: "How can I invest in an IPO?",
      answer: "You can invest in an IPO through your broker or trading platform. You need to apply during the IPO application period with the desired number of shares and price."
    },
    {
      question: "What are the risks of investing in IPOs?",
      answer: "IPO investments carry risks including market volatility, company performance uncertainty, lock-in periods, and potential listing gains or losses."
    },
    {
      question: "What is the minimum investment amount for IPOs?",
      answer: "The minimum investment varies by IPO, but typically ranges from ₹10,000 to ₹15,000 for retail investors, depending on the lot size and price band."
    },
    {
      question: "How long does the IPO process take?",
      answer: "The IPO process typically takes 3-7 days from application to listing, including the bidding period, basis of allotment, and listing on stock exchanges."
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 p-4">
        <div className="container mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2 text-blue-500 hover:text-blue-400">
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Home</span>
          </Link>
          <h1 className="text-2xl font-bold">FAQ Demo</h1>
          <div></div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Interactive FAQ Demo</h2>
            <p className="text-gray-400 text-lg">
              Try our AI-powered FAQ generator and see how your FAQs will look when embedded
            </p>
          </div>

          {/* Interactive Demo Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            {/* Input Section */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Play className="h-5 w-5 mr-2 text-blue-500" />
                  Try the Generator
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Enter content to see how FAQify generates relevant questions and answers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-gray-800">
                    <TabsTrigger value="url" className="text-gray-300 data-[state=active]:text-white data-[state=active]:bg-blue-600">
                      <Globe className="h-4 w-4 mr-2" />
                      URL
                    </TabsTrigger>
                    <TabsTrigger value="text" className="text-gray-300 data-[state=active]:text-white data-[state=active]:bg-blue-600">
                      <FileText className="h-4 w-4 mr-2" />
                      Text
                    </TabsTrigger>
                    <TabsTrigger value="upload" className="text-gray-300 data-[state=active]:text-white data-[state=active]:bg-blue-600">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="url" className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Website URL
                      </label>
                      <Input
                        type="url"
                        placeholder="https://example.com/about"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="text" className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Text Content
                      </label>
                      <Textarea
                        placeholder="Paste your content here..."
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white min-h-[120px]"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="upload" className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Upload Document
                      </label>
                      <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-gray-600 transition-colors">
                        <Upload className="h-8 w-8 mx-auto mb-3 text-gray-400" />
                        <div className="space-y-2">
                          {uploadedFile ? (
                            <div>
                              <p className="text-sm text-green-400">✓ {uploadedFile.name}</p>
                              <p className="text-xs text-gray-500">
                                {(uploadedFile.size / 1024).toFixed(1)} KB
                              </p>
                              <Button
                                onClick={() => setUploadedFile(null)}
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:text-red-300 mt-2"
                              >
                                Remove file
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm text-gray-300">
                                Drop your file here or{" "}
                                <label className="text-blue-400 hover:text-blue-300 cursor-pointer underline">
                                  browse
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.doc,.docx,.txt"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) setUploadedFile(file);
                                    }}
                                  />
                                </label>
                              </p>
                              <p className="text-xs text-gray-500">
                                Supports PDF, DOC, DOCX, TXT files
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <Button
                  onClick={simulateGeneration}
                  disabled={isGenerating}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating FAQs...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Generate Demo FAQs
                    </>
                  )}
                </Button>

                {isGenerating && (
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-gray-400">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></div>
                      Analyzing content...
                    </div>
                    <div className="flex items-center text-sm text-gray-400">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></div>
                      Generating questions...
                    </div>
                    <div className="flex items-center text-sm text-gray-400">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></div>
                      Creating answers...
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results Section */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <ArrowRight className="h-5 w-5 mr-2 text-green-500" />
                  Generated FAQs
                </CardTitle>
                <CardDescription className="text-gray-400">
                  {showResults ? "Your AI-generated FAQ pairs" : "Results will appear here after generation"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!showResults && !isGenerating && (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
                    <p>Click "Generate Demo FAQs" to see results</p>
                  </div>
                )}

                {showResults && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="secondary" className="bg-green-600/20 text-green-400 border-green-600/30">
                        {generatedFAQs.length} FAQs Generated
                      </Badge>
                    </div>

                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {generatedFAQs.map((faq, index) => (
                        <div key={index} className="bg-gray-800/50 rounded-lg p-4">
                          <h4 className="font-medium text-white mb-2">{faq.question}</h4>
                          <p className="text-gray-400 text-sm">{faq.answer}</p>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-gray-700">
                      <p className="text-xs text-gray-500 text-center">
                        This is a demo. Sign up to generate real FAQs from your content!
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-800 my-12"></div>

          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold mb-4">Live Widget Preview</h3>
            <p className="text-gray-400">
              See how your FAQs will look when embedded on your website
            </p>
          </div>

          {/* Demo Website Frame */}
          <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden mb-8">
            {/* Mock Browser Header */}
            <div className="bg-gray-800 px-4 py-3 flex items-center space-x-2">
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <div className="flex-1 text-center">
                <div className="bg-gray-700 rounded px-3 py-1 text-sm text-gray-300 max-w-md mx-auto">
                  https://example.com/ipo-guide
                </div>
              </div>
            </div>

            {/* Mock Website Content */}
            <div className="bg-white text-black p-8">
              <div className="max-w-3xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-900 mb-4">Complete Guide to IPO Investment</h1>
                <p className="text-gray-600 mb-8">
                  Learn everything you need to know about Initial Public Offerings and how to invest wisely.
                </p>

                {/* Embedded FAQ Section */}
                <div className="border-t border-gray-200 pt-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
                  
                  <div className="space-y-4">
                    {sampleFAQs.map((faq, index) => (
                      <details key={index} className="bg-gray-50 rounded-lg border border-gray-200">
                        <summary className="p-4 cursor-pointer hover:bg-gray-100 font-medium text-gray-900">
                          {faq.question}
                        </summary>
                        <div className="px-4 pb-4 text-gray-700">
                          {faq.answer}
                        </div>
                      </details>
                    ))}
                  </div>

                  <div className="mt-6 text-xs text-gray-500 text-center">
                    Powered by FAQify
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Embed Code Section */}
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
            <h3 className="text-xl font-bold mb-4">Embed Code</h3>
            <p className="text-gray-400 mb-4">
              Copy this code and paste it into your website where you want the FAQs to appear:
            </p>
            
            <div className="bg-black rounded-lg p-4 relative">
              <pre className="text-green-400 text-sm overflow-x-auto">
                <code>{embedCode}</code>
              </pre>
              <Button
                onClick={copyToClipboard}
                size="sm"
                className="absolute top-2 right-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center mt-12">
            <h3 className="text-2xl font-bold mb-4">Ready to Generate Your Own FAQs?</h3>
            <p className="text-gray-400 mb-6">
              Start creating professional FAQ sections for your website in minutes
            </p>
            <Link to="/signup">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                Start Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Demo;
