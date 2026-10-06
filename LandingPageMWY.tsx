import { Navigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/home/HeroSection";
import LandingContent from "@/components/home/LandingContent";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";

const LandingPageMWY = () => {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useRole();

  if (!authLoading && !!user && !roleLoading) {
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "sub_admin") return <Navigate to="/gestor" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <LandingContent />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPageMWY;
