import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "admin" | "sub_admin" | "client" | null;

const resolveRole = (roles: string[] = []): Exclude<AppRole, null> => {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("sub_admin")) return "sub_admin";
  return "client";
};

export function useRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    const loadRole = async () => {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        if (!cancelled) setRole(resolveRole((data || []).map((r) => r.role)));
      } catch (error) {
        console.error("Erro ao verificar a função do usuário:", error);
        if (!cancelled) setRole("client");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadRole();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { role, loading };
}
