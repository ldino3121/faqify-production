import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Target, Users, Lightbulb, Award, Globe } from "lucide-react";

const About = () => {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />

      <main className="pt-20">
        {/* Hero Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-4xl text-center">
            <div className="flex justify-center mb-6">
              <svg className="h-16 w-16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="#3b82f6" strokeWidth="2" fill="none"/>
                <rect x="0" y="11" width="3" height="2" fill="#3b82f6"/>
                <rect x="21" y="11" width="3" height="2" fill="#3b82f6"/>
                <path d="M7.5 12c1.5-2 3-2 4.5 0s3 2 4.5 0" stroke="#3b82f6" strokeWidth="2" fill="none" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              About <span className="text-blue-500">FAQify</span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
              We're on a mission to transform how businesses create and manage FAQ content,
              making it effortless to provide exceptional customer support through AI-powered solutions.
            </p>
            <p className="text-sm text-gray-500">A product by Saubhagya Samridhi</p>

          </div>
        </section>

        {/* Mission Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-6">Our Mission</h2>
                <p className="text-gray-400 text-lg mb-6">
                  At FAQify, we believe that every business deserves to provide outstanding customer support
                  without the complexity and time investment traditionally required to create comprehensive FAQ sections.
                </p>
                <p className="text-gray-400 text-lg">
                  Our AI-powered platform transforms any content into professional, engaging FAQ sections
                  that reduce support tickets, improve user experience, and help businesses scale their customer service efficiently.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6 text-center">
                    <Target className="h-8 w-8 text-blue-500 mx-auto mb-4" />
                    <h3 className="text-white font-semibold mb-2">Focused</h3>
                    <p className="text-gray-400 text-sm">Laser-focused on FAQ generation excellence</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6 text-center">
                    <Lightbulb className="h-8 w-8 text-blue-500 mx-auto mb-4" />
                    <h3 className="text-white font-semibold mb-2">Innovative</h3>
                    <p className="text-gray-400 text-sm">Cutting-edge AI technology for smart content analysis</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6 text-center">
                    <Users className="h-8 w-8 text-blue-500 mx-auto mb-4" />
                    <h3 className="text-white font-semibold mb-2">User-Centric</h3>
                    <p className="text-gray-400 text-sm">Built for businesses of all sizes and technical levels</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6 text-center">
                    <Award className="h-8 w-8 text-blue-500 mx-auto mb-4" />
                    <h3 className="text-white font-semibold mb-2">Quality</h3>
                    <p className="text-gray-400 text-sm">Professional-grade FAQs that enhance user experience</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Story Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/20">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl font-bold text-center mb-12">Our Story</h2>
            <div className="space-y-8">
              <div className="text-center">
                <p className="text-gray-400 text-lg leading-relaxed">
                  FAQify was born from a simple observation: businesses spend countless hours manually creating
                  FAQ sections, often resulting in incomplete or poorly structured content that fails to address
                  customer needs effectively.
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-400 text-lg leading-relaxed">
                  We saw an opportunity to leverage advanced AI technology to automate this process,
                  not just to save time, but to create better, more comprehensive FAQ content that truly serves both
                  businesses and their customers.
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-400 text-lg leading-relaxed">
                  Today, FAQify helps businesses across the globe transform their content into professional
                  FAQ sections that reduce support workload, improve customer satisfaction, and drive business growth.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-6xl">
            <h2 className="text-3xl font-bold text-center mb-12">Our Values</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-8 text-center">
                  <Globe className="h-12 w-12 text-blue-500 mx-auto mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-4">Accessibility</h3>
                  <p className="text-gray-400">
                    Making professional FAQ creation accessible to businesses of all sizes,
                    from startups to enterprises.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-8 text-center">
                  <Target className="h-12 w-12 text-blue-500 mx-auto mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-4">Excellence</h3>
                  <p className="text-gray-400">
                    Delivering high-quality, accurate, and engaging FAQ content that exceeds
                    expectations every time.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-8 text-center">
                  <Lightbulb className="h-12 w-12 text-blue-500 mx-auto mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-4">Innovation</h3>
                  <p className="text-gray-400">
                    Continuously pushing the boundaries of what's possible with AI-powered
                    content generation technology.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-blue-600/10">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-6">Ready to Transform Your FAQ Experience?</h2>
            <p className="text-xl text-gray-400 mb-8">
              Join thousands of businesses already using FAQify to create professional FAQ sections effortlessly.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/signup"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
              >
                Get Started Free
              </a>
              <a
                href="/demo"
                className="border border-gray-600 hover:border-gray-500 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
              >
                View Demo
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
