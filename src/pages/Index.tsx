
import { Hero } from "@/components/sections/Hero";
import { Features } from "@/components/sections/Features";
import { Pricing } from "@/components/sections/Pricing";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { IndustryExamples } from "@/components/sections/IndustryExamples";
import { SocialProof } from "@/components/sections/SocialProof";
import { FAQ } from "@/components/sections/FAQ";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <IndustryExamples />
      <SocialProof />
      <FAQ />
      <Footer />
    </div>
  );
};

export default Index;
