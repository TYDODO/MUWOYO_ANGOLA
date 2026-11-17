import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import logo from "@/assets/muwoyo-logo.png";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

export default function PwaLaunchGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [splashVisible, setSplashVisible] = useState(() => typeof window !== "undefined" && isStandalone());

  useEffect(() => {
    if (!isStandalone()) return;
    if (location.pathname === "/") navigate("/login", { replace: true });
    const timer = window.setTimeout(() => setSplashVisible(false), 1300);
    return () => window.clearTimeout(timer);
  }, []);

  if (splashVisible) {
    return (
      <div className="fixed inset-0 z-[200] flex min-h-screen items-center justify-center overflow-hidden bg-[#0d3b2e] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#2bb673_0%,transparent_48%)] opacity-40" />
        <div className="relative flex flex-col items-center gap-5 px-8 text-center">
          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white p-5 shadow-2xl shadow-black/20">
            <img src={logo} alt="Muwoyo" className="h-full w-full object-contain" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Muwoyo</h1>
            <p className="mt-2 text-sm text-white/70">Automação inteligente para o seu negócio</p>
          </div>
          <span className="mt-5 h-1 w-16 overflow-hidden rounded-full bg-white/20"><span className="block h-full w-1/2 animate-pulse rounded-full bg-[#63d98b]" /></span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}