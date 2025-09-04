import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Scale, FileText, Shield, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

const Terms = () => {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      
      <main className="pt-20">
        {/* Hero Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl text-center">
            <Scale className="h-16 w-16 text-blue-500 mx-auto mb-6" />
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Terms of <span className="text-blue-500">Service</span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
              These terms govern your use of FAQify. By using our service, you agree to these terms and conditions.
            </p>
            <p className="text-sm text-gray-500">Last updated: January 2024</p>
          </div>
        </section>

        {/* Terms Overview */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-6xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6 text-center">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-4" />
                  <h3 className="text-white font-semibold mb-2">Fair Use</h3>
                  <p className="text-gray-400 text-sm">Use FAQify responsibly and in accordance with our usage guidelines.</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6 text-center">
                  <Shield className="h-8 w-8 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-white font-semibold mb-2">Your Rights</h3>
                  <p className="text-gray-400 text-sm">You retain ownership of your content and generated FAQs.</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-white font-semibold mb-2">Limitations</h3>
                  <p className="text-gray-400 text-sm">Understand the limitations and restrictions of our service.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Terms Content */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl">
            <div className="space-y-12">
              
              {/* Acceptance of Terms */}
              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center">
                  <FileText className="h-8 w-8 text-blue-500 mr-3" />
                  Acceptance of Terms
                </h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <p className="text-gray-400 mb-4">
                      By accessing and using FAQify ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
                    </p>
                    <p className="text-gray-400">
                      If you do not agree to abide by the above, please do not use this service. We reserve the right to update these terms at any time, and your continued use of the service constitutes acceptance of any changes.
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Service Description */}
              <div>
                <h2 className="text-3xl font-bold mb-6">Service Description</h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <p className="text-gray-400 mb-4">
                      FAQify is an AI-powered platform that generates frequently asked questions (FAQs) from various content sources including:
                    </p>
                    <ul className="list-disc list-inside text-gray-400 space-y-2 mb-4">
                      <li>Website URLs and web content</li>
                      <li>Text documents and content</li>
                      <li>Uploaded files and documents</li>
                    </ul>
                    <p className="text-gray-400">
                      The service provides tools to create, manage, and embed FAQ sections on your websites and platforms.
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* User Accounts */}
              <div>
                <h2 className="text-3xl font-bold mb-6">User Accounts</h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-2">Account Creation</h3>
                        <p className="text-gray-400">
                          You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your account credentials.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-2">Account Responsibility</h3>
                        <p className="text-gray-400">
                          You are responsible for all activities that occur under your account. Notify us immediately of any unauthorized use of your account.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-2">Account Termination</h3>
                        <p className="text-gray-400">
                          We reserve the right to terminate accounts that violate these terms or engage in prohibited activities.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Acceptable Use */}
              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center">
                  <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
                  Acceptable Use
                </h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <h3 className="text-white font-semibold mb-4 flex items-center">
                          <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                          Permitted Uses
                        </h3>
                        <ul className="space-y-2 text-gray-400">
                          <li>• Generate FAQs for legitimate business purposes</li>
                          <li>• Create FAQ content for your own websites</li>
                          <li>• Use generated content for customer support</li>
                          <li>• Embed FAQs on your platforms</li>
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-4 flex items-center">
                          <XCircle className="h-5 w-5 text-red-500 mr-2" />
                          Prohibited Uses
                        </h3>
                        <ul className="space-y-2 text-gray-400">
                          <li>• Generate content for illegal activities</li>
                          <li>• Create misleading or false information</li>
                          <li>• Violate intellectual property rights</li>
                          <li>• Attempt to reverse engineer our AI models</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Intellectual Property */}
              <div>
                <h2 className="text-3xl font-bold mb-6">Intellectual Property</h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-3">Your Content</h3>
                        <p className="text-gray-400">
                          You retain ownership of all content you submit to FAQify. By using our service, you grant us a license to process your content for the purpose of generating FAQs.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-3">Generated Content</h3>
                        <p className="text-gray-400">
                          You own the FAQs generated from your content. However, you are responsible for ensuring that your use of generated content complies with applicable laws and third-party rights.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-3">Our Platform</h3>
                        <p className="text-gray-400">
                          FAQify and its underlying technology, including our AI models and algorithms, remain our intellectual property.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Limitation of Liability */}
              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center">
                  <AlertTriangle className="h-8 w-8 text-yellow-500 mr-3" />
                  Limitation of Liability
                </h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <div className="space-y-4">
                      <p className="text-gray-400">
                        FAQify is provided "as is" without warranties of any kind. We do not guarantee the accuracy, completeness, or reliability of generated content.
                      </p>
                      <p className="text-gray-400">
                        To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.
                      </p>
                      <p className="text-gray-400">
                        Our total liability for any claims related to the service shall not exceed the amount you paid for the service in the 12 months preceding the claim.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Subscription and Billing */}
              <div>
                <h2 className="text-3xl font-bold mb-6">Subscription and Billing</h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-white font-semibold mb-2">Subscription Plans</h3>
                        <p className="text-gray-400">
                          We offer various subscription plans with different features and usage limits. Plan details and pricing are available on our website.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">Billing</h3>
                        <p className="text-gray-400">
                          Subscriptions are billed in advance on a monthly or annual basis. All fees are non-refundable except as required by law.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">Cancellation</h3>
                        <p className="text-gray-400">
                          You may cancel your subscription at any time. Cancellation will take effect at the end of your current billing period.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Contact Information */}
              <div>
                <h2 className="text-3xl font-bold mb-6">Contact Information</h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <p className="text-gray-400 mb-4">
                      If you have any questions about these Terms of Service, please contact us:
                    </p>
                    <div className="space-y-2">
                      <p className="text-white">Email: <span className="text-blue-400">faqify18@gmail.com</span></p>
                      <p className="text-white">Support: <span className="text-blue-400">faqify18@gmail.com</span></p>
                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Terms;
