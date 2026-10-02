
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Play } from "lucide-react";
import { Link } from "react-router-dom";

export const Hero = () => {
  return (
    <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto text-center">
        <div className="flex justify-center mb-6">
          <div className="flex items-center space-x-2 bg-blue-600/10 border border-blue-600/20 rounded-full px-4 py-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-blue-400">AI-Powered FAQ &amp; Support Widget</span>
          </div>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
          Answer every
          <br />
          <span className="text-blue-500">visitor question</span>
        </h1>
        
        <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto leading-relaxed">
          FAQify turns your site, docs, or text into a searchable AI FAQ widget that answers real
          questions at the moment of doubt — lifting conversions and deflecting support tickets.
          Live on your site in under a minute.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <Link to="/signup">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white border-0 px-8 py-3 text-lg">
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          
          <Link to="/demo">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white border-0 px-8 py-3 text-lg">
              <Play className="mr-2 h-5 w-5" />
              Watch Demo
            </Button>
          </Link>
        </div>
        
        <div className="flex justify-center items-center space-x-8 text-sm text-gray-500">
          <div className="flex items-center space-x-2">
            <Zap className="h-4 w-4 text-green-500" />
            <span>5 Free FAQs / month</span>
          </div>
          <div className="flex items-center space-x-2">
            <Zap className="h-4 w-4 text-green-500" />
            <span>No Credit Card</span>
          </div>
          <div className="flex items-center space-x-2">
            <Zap className="h-4 w-4 text-green-500" />
            <span>Embed Anywhere</span>
          </div>
        </div>
      </div>
    </section>
  );
};
