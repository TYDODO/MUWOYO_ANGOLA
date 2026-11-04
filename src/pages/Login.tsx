import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resolveAppRole } from "@/lib/app-role";
import logo from "@/assets/muwoyo-logo.png";
import { initWebPush, isValidVapidPublicKey } from "@/lib/web-push";

export default function Login() {
  const { user, signIn, signOut, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [routingError, setRoutingError] = useState(false);
  const [routeAttempt, setRouteAttempt] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
  }, []);

  useEffect(() => {
    if (loading || !user || window.localStorage.getItem("muwoyo_push_permission_requested")) return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || import.meta.env.VAPID_PUBLIC_KEY;
    if (!isValidVapidPublicKey(vapidKey) || !("Notification" in window)) return;
    window.localStorage.setItem("muwoyo_push_permission_requested", "1");
    void initWebPush().catch((error) => console.warn("Push permission was not enabled", error));
  }, [loading, user]);

  useEffect(() => {
    if (!loading && user) {
      let cancelled = false;
      setRoutingError(false);
      const redirectSignedInUser = async () => {
        try {
          const { data: roleRows, error: roleError } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id);
          if (roleError) throw roleError;

          const userRole = resolveAppRole((roleRows || []).map((row) => row.role));
          if (userRole === "admin") {
            if (!cancelled) navigate("/admin", { replace: true });
            return;
          }
          if (userRole === "sub_admin") {
            if (!cancelled) navigate("/gestor", { replace: true });
            return;
          }

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("email_verified")
            .eq("user_id", user.id)
            .maybeSingle();
          if (profileError) throw profileError;
          if (!profile?.email_verified && !user.email_confirmed_at) {
            window.sessionStorage.setItem("muwoyo_pending_email", user.email || "");
            if (!cancelled) navigate("/confirmar-email", { replace: true, state: { email: user.email } });
            return;
          }

          const destination = userRole === "attendant"
            ? "/atendente"
            : userRole === "delivery_person"
              ? "/entregador"
              : "/dashboard";
          if (!cancelled) navigate(destination, { replace: true });
        } catch (error) {
          console.error("Erro ao verificar role:", error);
          toast({
            title: "Não foi possível validar o acesso",
            description: error instanceof Error ? error.message : "Tente novamente.",
            variant: "destructive",
          });
          if (!cancelled) setRoutingError(true);
        }
      };

      void redirectSignedInUser();
      return () => { cancelled = true; };
    }
  }, [loading, user, navigate, toast, routeAttempt]);

  if (loading) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center" aria-label="Carregando" />;
  }
  if (user && routingError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        <section className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 text-center shadow-lg">
          <h1 className="text-xl font-semibold text-gray-800">Não foi possível validar o acesso</h1>
          <p className="text-sm text-gray-500">A sua sessão continua ativa. Tente novamente ou saia e volte a entrar.</p>
          <div className="flex justify-center gap-3">
            <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setRouteAttempt((attempt) => attempt + 1)}>Tentar novamente</button>
            <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={() => void signOut()}>Sair</button>
          </div>
        </section>
      </main>
    );
  }
  if (user) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center" aria-label="A redirecionar" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      if (error.toLowerCase().includes("email_not_confirmed") || error.toLowerCase().includes("email not confirmed")) {
        window.sessionStorage.setItem("muwoyo_pending_email", email.trim().toLowerCase());
        navigate("/confirmar-email", { replace: true, state: { email: email.trim().toLowerCase(), initialSend: true } });
        return;
      }
      return toast({
        title: "Erro ao entrar",
        description: error,
        variant: "destructive",
      });
    }

    // AuthProvider observes the sign-in and the effect above routes by role.
  };

  const handleCreateAccount = () => {
    navigate("/criar-conta");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl h-[600px] flex flex-col md:flex-row">
        <div className="w-full md:w-5/12 bg-gray-50 p-10 flex flex-col justify-center">
          <div className="mb-8 flex items-center gap-3">
            <img src={logo} alt="Muwoyo" className="h-12 w-12 object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Muwoyo</h1>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-gray-800 mb-2">Login</h2>
          <p className="text-gray-500 mb-8">Entre com seus dados</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Usuário"
                className="w-full border-b border-gray-300 py-2 bg-transparent outline-none transition focus:border-whatsapp"
              />
            </div>
            <div>
              <input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                className="w-full border-b border-gray-300 py-2 bg-transparent outline-none transition focus:border-whatsapp"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-whatsapp transition"
                onClick={() => setShow(!show)}
              >
                {show ? "Ocultar senha" : "Mostrar senha"}
              </button>
              <button type="button" className="text-sm text-gray-400 hover:text-whatsapp transition" onClick={() => navigate("/recuperar-password")}>Esqueci a senha</button>
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-whatsapp transition"
                onClick={handleCreateAccount}
              >
                Criar conta
              </button>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-whatsapp py-3 text-white font-semibold hover:bg-green-800 transition"
              disabled={submitting}
            >
              {submitting ? "Carregando..." : "Login"}
            </button>
          </form>

          <div className="mt-auto space-y-4 pt-10 text-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Não possui conta?</span>
              <button
                type="button"
                className="rounded border border-gray-300 px-4 py-1 text-sm hover:bg-gray-200 transition"
                onClick={handleCreateAccount}
              >
                Criar conta
              </button>
            </div>
            {!standalone && <button
              type="button"
              className="text-left text-sm text-gray-500 hover:text-whatsapp transition"
              onClick={() => navigate("/")}
            >Voltar para o site</button>}
          </div>
        </div>

        <div className="w-full md:w-7/12 bg-[#25D366] p-12 flex flex-col justify-center text-white relative overflow-hidden">
          <h2 className="text-4xl font-bold leading-tight mb-4">Seja bem-vindo a Muwoyo</h2>
          <p className="text-white/80">
            Faça o seu login para começares a automatizar o teu WhatsApp agora mesmo.
          </p>

          <div className="mt-12 flex justify-center opacity-80">
            <svg viewBox="0 0 200 200" className="w-64 h-64 text-white">
              <circle cx="100" cy="100" r="80" fill="currentColor" fillOpacity="0.1" />
              <path
                d="M50 150 Q100 120 150 150"
                stroke="white"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
              />
              <rect x="70" y="60" width="60" height="80" rx="10" fill="white" fillOpacity="0.2" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
