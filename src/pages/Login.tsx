import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";
import logo from "@/assets/muwoyo-logo.png";

export default function Login() {
  const { user, signIn, signUp, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  if (!loading && user) {
    // Verificar o role do usuário
    const checkUserRole = async () => {
      try {
        console.log("Verificando role do usuário:", user.id);
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        console.log("Dados do role:", roleData);
        const userRole = roleData?.role || "client";
        console.log("Role final:", userRole);

        // Redirecionar baseado no role
        if (userRole === "admin") {
          console.log("Redirecionando para /admin");
          navigate("/admin", { replace: true });
        } else if (userRole === "sub_admin") {
          console.log("Redirecionando para /gestor");
          navigate("/gestor", { replace: true });
        } else {
          console.log("Redirecionando para /dashboard");
          navigate("/dashboard", { replace: true });
        }
      } catch (error) {
        console.error("Erro ao verificar role:", error);
        navigate("/dashboard", { replace: true });
      }
    };

    checkUserRole();
    return null; // Retornar null enquanto verifica o role
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (mode === "signin") {
      const { error } = await signIn(email, password);
      setSubmitting(false);
      if (error)
        return toast({
          title: "Erro ao entrar",
          description: error,
          variant: "destructive",
        });

      // Verificar o role do usuário após login
      try {
        // Obter o usuário atual
        const {
          data: { user: currentUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !currentUser) {
          console.error("Erro ao obter usuário:", userError);
          navigate("/dashboard", { replace: true });
          return;
        }

        console.log("Verificando role após login do usuário:", currentUser.id);
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        console.log("Dados do role após login:", roleData);
        const userRole = roleData?.role || "client";
        console.log("Role final após login:", userRole);

        // Redirecionar baseado no role
        if (userRole === "admin") {
          console.log("Redirecionando para /admin após login");
          navigate("/admin", { replace: true });
        } else if (userRole === "sub_admin") {
          console.log("Redirecionando para /gestor após login");
          navigate("/gestor", { replace: true });
        } else {
          console.log("Redirecionando para /dashboard após login");
          navigate("/dashboard", { replace: true });
        }
      } catch (error) {
        console.error("Erro ao verificar role após login:", error);
        navigate("/dashboard", { replace: true });
      }
    } else {
      const { error } = await signUp(email, password, {
        full_name: fullName,
        phone,
      });
      setSubmitting(false);
      if (error)
        return toast({
          title: "Erro",
          description: error,
          variant: "destructive",
        });
      toast({
        title: "Conta criada",
        description: "Pode iniciar sessão agora.",
      });
      setMode("signin");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Decorative background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, hsl(var(--primary)) 0%, transparent 35%), radial-gradient(circle at 85% 80%, hsl(var(--primary)) 0%, transparent 40%), radial-gradient(circle at 50% 50%, hsl(var(--primary)) 0%, transparent 55%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/90 p-7 shadow-xl backdrop-blur sm:p-9">
          <div className="mb-7 flex items-center gap-3">
            <img src={logo} alt="Muwoyo" className="h-11 w-11 object-contain" />
            <div>
              <div className="text-xl font-bold leading-none">Muwoyo</div>
              <div className="text-xs text-muted-foreground">
                Empresa de automação de WhatsApp
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Entrar na sua conta" : "Criar nova conta"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Acesse o painel da Muwoyo."
              : "Crie a sua conta para começar."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label>Nome completo</Label>
                  <Input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11"
                    placeholder="244928663898"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShow(!show)}
                >
                  {show ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "signin" ? (
                "Entrar"
              ) : (
                "Criar conta"
              )}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">
              {mode === "signin" ? "AINDA NÃO TEM CONTA?" : "JÁ TEM CONTA?"}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => {
              if (mode === "signin") {
                const message = encodeURIComponent(
                  "Olá! Quero criar minha conta na Muwoyo.",
                );
                window.open(
                  `https://wa.me/5511999999999?text=${message}`,
                  "_blank",
                );
              } else {
                setMode("signin");
              }
            }}
          >
            {mode === "signin" ? "Criar conta" : "Entrar"}
          </Button>

          <div className="mt-7 text-center text-xs text-muted-foreground">
            © 2026 Muwoyo · suporte@muwoyo.com
          </div>
        </div>
      </div>
    </div>
  );
}
