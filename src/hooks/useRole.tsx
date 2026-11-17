import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { resolveAppRole, type AppRole } from "@/lib/app-role";

export type { AppRole } from "@/lib/app-role";

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
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        if (error) throw error;

        const roles = (data || []).map((row) => row.role);
        if (!roles.some((item) => item === "attendant" || item === "delivery_person")) {
          const { data: deliveryPerson, error: deliveryError } = await supabase
            .from("delivery_people")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (deliveryError) throw deliveryError;
          if (deliveryPerson) roles.push("delivery_person");
        }
        if (!cancelled) setRole(resolveAppRole(roles));
      } catch (error) {
        console.error("Erro ao verificar a função do usuário:", error);
        if (!cancelled) setRole(null);
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
