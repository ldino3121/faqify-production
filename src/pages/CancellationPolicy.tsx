import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Mail, Shield, Clock, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

const CancellationPolicy = () => {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      
      <main className="pt-20">
        {/* Hero Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Cancellation and <span className="text-blue-500">Refund Policy</span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
              Thank you for choosing FAQify. Please read our Cancellation and Refund Policy carefully before subscribing to our services.
            </p>
          </div>
        </section>

        {/* Policy Content */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl space-y-8">
            
            {/* Free Plan */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="p-8">
                <div className="flex items-start space-x-4">
                  <Shield className="h-8 w-8 text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-4">Free Plan (Trial)</h2>
                    <p className="text-gray-300 text-lg leading-relaxed">
                      We offer a free plan as a trial for new users. This allows you to explore and evaluate our platform without any financial commitment. The free plan is limited in features and duration, as specified during sign-up.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subscription Cancellation */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="p-8">
                <div className="flex items-start space-x-4">
                  <XCircle className="h-8 w-8 text-orange-500 mt-1 flex-shrink-0" />
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-4">Subscription Cancellation</h2>
                    <div className="text-gray-300 text-lg leading-relaxed space-y-4">
                      <p>
                        Once you have subscribed to any of our paid plans, we do not allow cancellation of the subscription during the active billing period. You may continue to use the service until the end of your current subscription term. After that, the subscription will not be renewed if you choose not to continue.
                      </p>
                      <p>
                        If you wish to cancel your subscription, please do so before the next billing cycle to avoid being charged for the subsequent term. Subscription cancellation can be managed through your account dashboard or by contacting our support team.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Refund Policy */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="p-8">
                <div className="flex items-start space-x-4">
                  <AlertTriangle className="h-8 w-8 text-red-500 mt-1 flex-shrink-0" />
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-4">Refund Policy</h2>
                    <div className="text-gray-300 text-lg leading-relaxed space-y-4">
                      <p>
                        We maintain a <strong className="text-red-400">strict no-refund policy</strong> on all paid subscription plans. Once a payment has been made, we do not offer refunds for any reason, including but not limited to:
                      </p>
                      <ul className="list-disc list-inside space-y-2 ml-4">
                        <li>Change of mind</li>
                        <li>Dissatisfaction with the service</li>
                        <li>Failure to use the service</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Support and Assistance */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="p-8">
                <div className="flex items-start space-x-4">
                  <Mail className="h-8 w-8 text-blue-500 mt-1 flex-shrink-0" />
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-4">Support and Assistance</h2>
                    <div className="text-gray-300 text-lg leading-relaxed space-y-4">
                      <p>
                        We strive to provide high-quality service and support. If you experience any issues or have questions regarding your subscription, please contact our support team at{" "}
                        <a href="mailto:faqify18@gmail.com" className="text-blue-400 hover:text-blue-300 underline">
                          faqify18@gmail.com
                        </a>
                        . We are here to assist you and ensure the best possible experience.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Policy Updates */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="p-8">
                <div className="flex items-start space-x-4">
                  <Clock className="h-8 w-8 text-purple-500 mt-1 flex-shrink-0" />
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-4">Policy Updates</h2>
                    <p className="text-gray-300 text-lg leading-relaxed">
                      We reserve the right to update or modify this Cancellation and Refund Policy at any time. Any changes will be communicated appropriately and will apply to all current and future subscriptions.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card className="bg-blue-900/20 border-blue-800">
              <CardContent className="p-8 text-center">
                <h3 className="text-xl font-bold text-white mb-4">Questions About This Policy?</h3>
                <p className="text-gray-300 mb-4">
                  If you have any questions about our Cancellation and Refund Policy, please don't hesitate to contact us.
                </p>
                <Link
                  to="/contact"
                  className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  <Mail className="h-5 w-5" />
                  <span>Contact Us</span>
                </Link>
              </CardContent>
            </Card>

          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default CancellationPolicy;
