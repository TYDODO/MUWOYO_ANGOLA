import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type FunnelStage = { label: string; count: number };
type SourceRow = { source: string; registered: number; onboarded: number; trials: number; paid: number };
const number = (value: number) => value.toLocaleString("pt-AO");

export default function AdminFunnel() {
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void (async () => {
      const [{ data: profiles, error: profilesError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
        supabase.from("profiles").select("user_id,onboarding_completed,trial_started_at,acquisition_source"),
        supabase.from("plan_subscriptions").select("user_id,status,confirmed_at"),
      ]);
      const loadError = profilesError || subscriptionsError;
      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }

      const profileRows = profiles || [];
      const paidUsers = new Set((subscriptions || [])
        .filter((subscription) => (subscription.status === "active" || subscription.status === "expired") && subscription.confirmed_at)
        .map((subscription) => subscription.user_id));
      const registered = profileRows.length;
      const onboarded = profileRows.filter((profile) => profile.onboarding_completed).length;
      const trials = profileRows.filter((profile) => profile.trial_started_at).length;
      const paid = profileRows.filter((profile) => paidUsers.has(profile.user_id)).length;

      setStages([
        { label: "Registados", count: registered },
        { label: "Onboarding concluído", count: onboarded },
        { label: "Teste iniciado", count: trials },
        { label: "Plano confirmado", count: paid },
      ]);

      const bySource = new Map<string, SourceRow>();
      profileRows.forEach((profile) => {
        const source = profile.acquisition_source?.trim() || "Não identificado";
        let row = bySource.get(source);
        if (!row) {
          row = { source, registered: 0, onboarded: 0, trials: 0, paid: 0 };
          bySource.set(source, row);
        }
        row.registered += 1;
        if (profile.onboarding_completed) row.onboarded += 1;
        if (profile.trial_started_at) row.trials += 1;
        if (paidUsers.has(profile.user_id)) row.paid += 1;
      });
      setSources([...bySource.values()].sort((a, b) => b.registered - a.registered));
      setLoading(false);
    })();
  }, []);

  const filteredSources = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt");
    return term ? sources.filter((row) => row.source.toLocaleLowerCase("pt").includes(term)) : sources;
  }, [sources, query]);
  const registeredCount = stages[0]?.count || 0;

  return (
    <AdminShell mode="admin" title="Funil de conversão" search={query} onSearch={setQuery}>
      {error ? <div role="alert" className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">Não foi possível carregar o funil: {error}</div> : loading ? <p className="py-8 text-center text-sm text-muted-foreground">A carregar dados do funil...</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stages.map((stage, index) => {
              const previous = stages[index - 1]?.count;
              const stepRate = index === 0 ? 100 : previous ? (stage.count / previous) * 100 : 0;
              const overallRate = registeredCount ? (stage.count / registeredCount) * 100 : 0;
              return (
                <Card key={stage.label}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{stage.label}</p>
                    <p className="mt-2 text-2xl font-bold">{number(stage.count)}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-sm bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.min(overallRate, 100)}%` }} /></div>
                    <p className="mt-2 text-xs text-muted-foreground">{index === 0 ? "Base total" : `${stepRate.toFixed(1)}% da etapa anterior`} · {overallRate.toFixed(1)}% do total</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader><CardTitle>Conversão por origem</CardTitle></CardHeader>
            <CardContent className="overflow-auto p-0">
              {filteredSources.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Sem dados para esta pesquisa.</p> : (
                <table className="w-full min-w-[680px] text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Origem</th><th className="p-3">Registados</th><th className="p-3">Onboarding</th><th className="p-3">Teste iniciado</th><th className="p-3">Plano confirmado</th><th className="p-3">Conversão</th></tr></thead>
                  <tbody>{filteredSources.map((row) => <tr key={row.source} className="border-b last:border-0 hover:bg-muted/30"><td className="p-3 font-medium">{row.source}</td><td className="p-3">{number(row.registered)}</td><td className="p-3">{number(row.onboarded)}</td><td className="p-3">{number(row.trials)}</td><td className="p-3">{number(row.paid)}</td><td className="p-3">{row.registered ? `${((row.paid / row.registered) * 100).toFixed(1)}%` : "0%"}</td></tr>)}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </AdminShell>
  );
}
