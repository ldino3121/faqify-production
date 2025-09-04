import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Eye, Lock, Users, FileText, Globe } from "lucide-react";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      
      <main className="pt-20">
        {/* Hero Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl text-center">
            <Shield className="h-16 w-16 text-blue-500 mx-auto mb-6" />
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Privacy <span className="text-blue-500">Policy</span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
              Your privacy is important to us. This policy explains how we collect, use, and protect your information when you use FAQify.
            </p>
            <p className="text-sm text-gray-500">Last updated: January 2024</p>
          </div>
        </section>

        {/* Privacy Overview */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-6xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6 text-center">
                  <Lock className="h-8 w-8 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-white font-semibold mb-2">Data Security</h3>
                  <p className="text-gray-400 text-sm">Your data is encrypted and stored securely using industry-standard practices.</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6 text-center">
                  <Eye className="h-8 w-8 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-white font-semibold mb-2">Transparency</h3>
                  <p className="text-gray-400 text-sm">We're transparent about what data we collect and how we use it.</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6 text-center">
                  <Users className="h-8 w-8 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-white font-semibold mb-2">Your Rights</h3>
                  <p className="text-gray-400 text-sm">You have full control over your data and can request deletion at any time.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Privacy Policy Content */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl">
            <div className="space-y-12">
              
              {/* Information We Collect */}
              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center">
                  <FileText className="h-8 w-8 text-blue-500 mr-3" />
                  Information We Collect
                </h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-3">Account Information</h3>
                        <p className="text-gray-400 mb-2">When you create an account, we collect:</p>
                        <ul className="list-disc list-inside text-gray-400 space-y-1">
                          <li>Name and email address</li>
                          <li>Password (encrypted)</li>
                          <li>Profile information you choose to provide</li>
                        </ul>
                      </div>
                      
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-3">Usage Data</h3>
                        <p className="text-gray-400 mb-2">We collect information about how you use FAQify:</p>
                        <ul className="list-disc list-inside text-gray-400 space-y-1">
                          <li>FAQ generation history and content</li>
                          <li>Website URLs and content you submit for analysis</li>
                          <li>Usage patterns and feature interactions</li>
                          <li>Technical information (IP address, browser type, device information)</li>
                        </ul>
                      </div>
                      
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-3">Payment Information</h3>
                        <p className="text-gray-400">
                          Payment processing is handled by secure third-party providers. We do not store your credit card information on our servers.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* How We Use Information */}
              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center">
                  <Globe className="h-8 w-8 text-blue-500 mr-3" />
                  How We Use Your Information
                </h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <div className="space-y-4">
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <p className="text-gray-400">Provide and improve our FAQ generation services</p>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <p className="text-gray-400">Process your content to generate relevant FAQs</p>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <p className="text-gray-400">Communicate with you about your account and our services</p>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <p className="text-gray-400">Analyze usage patterns to improve our platform</p>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <p className="text-gray-400">Ensure security and prevent fraud</p>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <p className="text-gray-400">Comply with legal obligations</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Data Security */}
              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center">
                  <Lock className="h-8 w-8 text-blue-500 mr-3" />
                  Data Security
                </h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <p className="text-gray-400 mb-6">
                      We implement industry-standard security measures to protect your information:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-white font-semibold mb-2">Encryption</h3>
                        <p className="text-gray-400 text-sm">All data is encrypted in transit and at rest using AES-256 encryption.</p>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">Access Controls</h3>
                        <p className="text-gray-400 text-sm">Strict access controls ensure only authorized personnel can access your data.</p>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">Regular Audits</h3>
                        <p className="text-gray-400 text-sm">We conduct regular security audits and vulnerability assessments.</p>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">Secure Infrastructure</h3>
                        <p className="text-gray-400 text-sm">Our infrastructure is hosted on secure, compliant cloud platforms.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Your Rights */}
              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center">
                  <Users className="h-8 w-8 text-blue-500 mr-3" />
                  Your Rights
                </h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <p className="text-gray-400 mb-6">You have the following rights regarding your personal data:</p>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-white font-semibold mb-2">Access</h3>
                        <p className="text-gray-400">Request a copy of the personal data we hold about you.</p>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">Correction</h3>
                        <p className="text-gray-400">Request correction of any inaccurate or incomplete data.</p>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">Deletion</h3>
                        <p className="text-gray-400">Request deletion of your personal data, subject to legal requirements.</p>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">Portability</h3>
                        <p className="text-gray-400">Request a copy of your data in a machine-readable format.</p>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">Objection</h3>
                        <p className="text-gray-400">Object to certain types of data processing.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Contact Information */}
              <div>
                <h2 className="text-3xl font-bold mb-6">Contact Us</h2>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8">
                    <p className="text-gray-400 mb-4">
                      If you have any questions about this Privacy Policy or our data practices, please contact us:
                    </p>
                    <div className="space-y-2">
                      <p className="text-white">Email: <span className="text-blue-400">privacy@faqify.com</span></p>
                      <p className="text-white">Address: <span className="text-gray-400">FAQify Privacy Team, [Your Address]</span></p>
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

export default Privacy;
