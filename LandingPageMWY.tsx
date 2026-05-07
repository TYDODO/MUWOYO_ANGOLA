import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/home/HeroSection";
import TypewriterSection from "@/components/home/TypewriterSection";
import FeaturesZigzag from "@/components/home/FeaturesZigzag";
import IntegrationsSection from "@/components/home/IntegrationsSection";
import SetupSection from "@/components/home/SetupSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import AIAgentDescription from "@/components/home/AIAgentDescription";
import { MessagePacks } from "@/components/home/MessagePacks";
import FAQSection from "@/components/home/FAQSection";
import CTASection from "@/components/home/CTASection";

const LandingPageMWY = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <TypewriterSection />
        <FeaturesZigzag />
        <IntegrationsSection />
        <TestimonialsSection />
        <AIAgentDescription />
        <SetupSection />
        <MessagePacks />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPageMWY;
