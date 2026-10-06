import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPlanEntitlements, PlanName, PlanEntitlements } from "@/lib/plan-entitlements";

export function usePlanEntitlements() {
  const [planName, setPlanName] = useState<PlanName>("Muwoyo Start");
  const [loading, setLoading] = useState(true);
  useEffect(() => { void (async () => { const { data: user } = await supabase.auth.getUser(); if (!user.user) return setLoading(false); const { data: profile } = await supabase.from("profiles").select("plan_id,account_status,subscription_expires_at").eq("user_id", user.user.id).maybeSingle(); if (profile?.plan_id) { const { data: plan } = await supabase.from("subscription_plans").select("name").eq("id", profile.plan_id).maybeSingle(); if (plan?.name) setPlanName(plan.name as PlanName); } setLoading(false); })(); }, []);
  return { planName, entitlements: getPlanEntitlements(planName), loading } as { planName: PlanName; entitlements: PlanEntitlements; loading: boolean };
}
