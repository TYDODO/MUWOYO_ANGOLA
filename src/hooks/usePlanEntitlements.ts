import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { getPlanEntitlements, PlanName, PlanEntitlements } from "@/lib/plan-entitlements";

export function usePlanEntitlements() {
  const { user, loading: authLoading } = useAuth();
  const { ownerUserId, loading: membershipLoading } = useBusinessMembership();
  const [planName, setPlanName] = useState<PlanName>("Muwoyo Start");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authLoading || membershipLoading) return;
    let cancelled = false;
    const load = async () => {
      if (!user?.id) {
        setPlanName("Muwoyo Start");
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: planNameData, error } = await supabase.rpc("get_business_plan_name");
      if (error) {
        console.error("Could not load business plan name", error.message);
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) {
        if (planNameData) setPlanName(planNameData as PlanName);
        setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [authLoading, membershipLoading, ownerUserId, user?.id]);
  return { planName, entitlements: getPlanEntitlements(planName), loading } as { planName: PlanName; entitlements: PlanEntitlements; loading: boolean };
}
