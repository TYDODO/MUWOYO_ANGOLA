import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/hooks/useRole";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { useDeliveryPerson } from "@/hooks/useDeliveryPerson";
import { Button } from "@/components/ui/button";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const { membership, loading: membershipLoading, hasPermission } = useBusinessMembership();
  const { deliveryPerson, loading: deliveryLoading } = useDeliveryPerson();
  const location = useLocation();
  const { toast } = useToast();
  const [checked, setChecked] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);

  useEffect(() => {
    if (!user) { setChecked(true); return; }
    if (role === "admin" || role === "sub_admin") {
      setChecked(true);
      return;
    }
    Promise.all([
      (supabase as any).from("profiles").select("is_suspended,status,email_verified").eq("user_id", user.id).maybeSingle(),
      (supabase as any).from("user_roles").select("role").eq("user_id", user.id),
    ]).then(async ([profileResult, rolesResult]: any[]) => {
      const { data, error } = profileResult;
      const isManager = (rolesResult.data || []).some((role: any) => role.role === "admin" || role.role === "sub_admin");
      if (error) {
        setChecked(true);
        return;
      }
      if (data?.is_suspended || data?.status === "suspended") {
        setSuspended(true);
        toast({ title: "Conta suspensa", description: "Sua conta foi suspensa. Contacte o administrador.", variant: "destructive" });
        await signOut();
      }
      setEmailVerified(isManager || data?.email_verified === true || Boolean(user.email_confirmed_at));
      setChecked(true);
    });
  }, [user, role]);

  if (loading || roleLoading || membershipLoading || deliveryLoading || !checked) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!user || suspended) return <Navigate to="/login" replace />;
  if (role !== "admin" && role !== "sub_admin" && !emailVerified) return <Navigate to="/confirmar-email" replace state={{ email: user.email }} />;
  if ((role === "delivery_person" || deliveryPerson) && deliveryPerson?.status !== "active") return <Navigate to="/login" replace />;
  if (deliveryPerson?.status === "active" && location.pathname !== "/entregador") return <Navigate to="/entregador" replace />;
  if (location.pathname === "/entregador" && deliveryPerson?.status !== "active") return <Navigate to="/dashboard" replace />;
  if ((role === "attendant" || membership?.role === "attendant") && (!membership || membership.status !== "active")) {
    const status = membership?.status;
    const title = status === "suspended" || status === "removed"
      ? "Acesso de atendente indisponível"
      : status === "pending"
        ? "Conta pendente de ativação"
        : "Não foi possível confirmar a equipa";
    const description = status === "pending"
      ? "O e-mail já está confirmado. Peça ao responsável da empresa para ativar a sua conta de atendente."
      : status === "suspended" || status === "removed"
        ? "Contacte o responsável da empresa para verificar o estado da sua conta."
        : "Não encontrámos a sua associação de atendente. Atualize os dados ou contacte o responsável da empresa.";

    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <section className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => window.location.reload()}>Tentar novamente</Button>
            <Button onClick={() => void signOut()}>Sair</Button>
          </div>
        </section>
      </main>
    );
  }
  if ((role === "attendant" || membership?.role === "attendant") && location.pathname !== "/atendente") {
    const permissionByPath: Record<string, string> = { "/inbox": "inbox.view", "/whatsapp": "contacts.view", "/crm": "crm.view", "/pedidos": "orders.view", "/agenda": "agenda.view", "/produtos": "products.view" };
    const permission = Object.entries(permissionByPath).find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`))?.[1];
    if (!permission || !hasPermission(permission)) return <Navigate to="/atendente" replace />;
  }
  if (role === "admin" || role === "sub_admin") return <>{children}</>;
  // The custom profiles.email_verified flag is the source of truth for the OTP flow.
  return <>{children}</>;
}
