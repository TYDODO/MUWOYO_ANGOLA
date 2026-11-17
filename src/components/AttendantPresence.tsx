import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { supabase } from "@/integrations/supabase/client";
import type { AppDatabase } from "@/integrations/supabase/app-types";

const appDb = supabase as unknown as SupabaseClient<AppDatabase>;

export default function AttendantPresence() {
  const { user } = useAuth();
  const { membership } = useBusinessMembership();

  useEffect(() => {
    if (!user || membership?.role !== "attendant" || membership.status !== "active" || !membership.business_id) return;

    const updatePresence = async (isOnline: boolean) => {
      const { error } = await appDb.from("business_member_presence").upsert({
        user_id: user.id,
        business_id: membership.business_id,
        is_online: isOnline,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) console.warn("Não foi possível atualizar o estado do atendente.", error);
    };

    const refresh = () => void updatePresence(document.visibilityState === "visible");
    const markOffline = () => void updatePresence(false);
    const heartbeat = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pagehide", markOffline);
    refresh();

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pagehide", markOffline);
      markOffline();
    };
  }, [membership, user]);

  return null;
}
