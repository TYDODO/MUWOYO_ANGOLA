import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, Coins, RefreshCw } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type UsageEvent = {
  id: string;
  user_id: string;
  execution_id: string | null;
  workflow_name: string | null;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  created_at: string;
};
type AiModel = {
  id: string;
  model_name: string;
  input_cost_per_1m_usd: number;
  output_cost_per_1m_usd: number;
};
type BalanceRow = {
  user_id: string;
  total_depositado_usd: number;
  total_gasto_usd: number;
  saldo_atual_usd: number;
};
type QueryResult<Row> = { data: Row[] | null; error: { message: string } | null };
type ReadQuery<Row> = {
  order: (column: string, options?: { ascending?: boolean }) => {
    limit: (count: number) => Promise<QueryResult<Row>>;
  };
};
type AiReadClient = {
  from(table: "ai_usage_events"): { select: (columns: string) => ReadQuery<UsageEvent> };
  from(table: "ai_models"): { select: (columns: string) => ReadQuery<AiModel> };
  from(table: "v_ai_user_balance_dashboard"): { select: (columns: string) => ReadQuery<BalanceRow> };
};

const aiDb = supabase as unknown as AiReadClient;
const formatUsd = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
}).format(Number(value || 0));
const formatNumber = (value: number) => Number(value || 0).toLocaleString("pt-AO");

export default function AdminAiCosts() {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [eventsResult, modelsResult, balancesResult, profilesResult] = await Promise.all([
        aiDb.from("ai_usage_events").select("*").order("created_at", { ascending: false }).limit(250),
        aiDb.from("ai_models").select("*").order("model_name", { ascending: true }).limit(200),
        aiDb.from("v_ai_user_balance_dashboard").select("*").order("total_gasto_usd", { ascending: false }).limit(10000),
        supabase.from("profiles").select("user_id,full_name,email"),
      ]);
      const error = eventsResult.error || modelsResult.error || balancesResult.error || profilesResult.error;
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      setEvents((eventsResult.data || []).map((row) => ({
        ...row,
        prompt_tokens: Number(row.prompt_tokens || 0),
        completion_tokens: Number(row.completion_tokens || 0),
        total_tokens: Number(row.total_tokens || 0),
        cost_usd: Number(row.cost_usd || 0),
      })));
      setModels((modelsResult.data || []).map((row) => ({
        ...row,
        input_cost_per_1m_usd: Number(row.input_cost_per_1m_usd || 0),
        output_cost_per_1m_usd: Number(row.output_cost_per_1m_usd || 0),
      })));
      setBalances((balancesResult.data || []).map((row) => ({
        ...row,
        total_depositado_usd: Number(row.total_depositado_usd || 0),
        total_gasto_usd: Number(row.total_gasto_usd || 0),
        saldo_atual_usd: Number(row.saldo_atual_usd || 0),
      })));
      setProfiles(profilesResult.data || []);
      setLoadError("");
      setLoading(false);
    })();
  }, [reloadKey]);

  const profileByUser = useMemo(() => new Map(profiles.map((profile) => [profile.user_id, profile])), [profiles]);
  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const filteredEvents = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt");
    if (!term) return events;
    return events.filter((event) => {
      const profile = profileByUser.get(event.user_id);
      const model = modelById.get(event.model_id);
      return `${profile?.full_name || ""} ${profile?.email || ""} ${model?.model_name || ""} ${event.workflow_name || ""} ${event.execution_id || ""}`.toLocaleLowerCase("pt").includes(term);
    });
  }, [events, profileByUser, modelById, query]);

  const totalSpent = balances.reduce((sum, row) => sum + row.total_gasto_usd, 0);
  const totalDeposited = balances.reduce((sum, row) => sum + row.total_depositado_usd, 0);
  const currentBalance = balances.reduce((sum, row) => sum + row.saldo_atual_usd, 0);

  return (
    <AdminShell mode="admin" title="Custos de IA" description="Consumo registado, saldo de IA e tarifas configuradas por modelo." search={query} onSearch={setQuery} onRefresh={() => setReloadKey((key) => key + 1)}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Gasto registado" value={formatUsd(totalSpent)} icon={<Coins className="h-4 w-4" />} />
        <Stat label="Depósitos registados" value={formatUsd(totalDeposited)} icon={<Coins className="h-4 w-4" />} />
        <Stat label="Saldo agregado" value={formatUsd(currentBalance)} icon={<Activity className="h-4 w-4" />} />
        <Stat label="Execuções recentes" value={formatNumber(events.length)} icon={<Bot className="h-4 w-4" />} />
      </div>

      {loadError && <div role="alert" className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">Não foi possível carregar os custos de IA: {loadError}</div>}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div><CardTitle>Modelos e tarifas</CardTitle><p className="mt-1 text-sm text-muted-foreground">Valores em USD por milhão de tokens.</p></div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}><RefreshCw className="h-4 w-4" />Atualizar</Button>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          {loading ? <p className="p-6 text-sm text-muted-foreground">A carregar tarifas...</p> : models.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nenhum modelo configurado.</p> : (
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Modelo</th><th className="p-3">Entrada / 1M</th><th className="p-3">Saída / 1M</th></tr></thead>
              <tbody>{models.map((model) => <tr key={model.id} className="border-b last:border-0"><td className="p-3 font-medium">{model.model_name}</td><td className="p-3">{formatUsd(model.input_cost_per_1m_usd)}</td><td className="p-3">{formatUsd(model.output_cost_per_1m_usd)}</td></tr>)}</tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Últimas execuções</CardTitle><p className="text-sm text-muted-foreground">Até 250 eventos mais recentes; os totais acima vêm do saldo agregado.</p></CardHeader>
        <CardContent className="overflow-auto p-0">
          {loading ? <p className="p-6 text-sm text-muted-foreground">A carregar execuções...</p> : filteredEvents.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nenhuma execução encontrada.</p> : (
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">Workflow</th><th className="p-3">Modelo</th><th className="p-3">Tokens</th><th className="p-3">Custo</th></tr></thead>
              <tbody>{filteredEvents.map((event) => {
                const profile = profileByUser.get(event.user_id);
                const model = modelById.get(event.model_id);
                return <tr key={event.id} className="border-b last:border-0 hover:bg-muted/30"><td className="p-3">{new Date(event.created_at).toLocaleString("pt-AO")}</td><td className="p-3">{profile?.full_name || profile?.email || event.user_id.slice(0, 8)}</td><td className="p-3">{event.workflow_name || "—"}</td><td className="p-3">{model?.model_name || "Modelo removido"}</td><td className="p-3">{formatNumber(event.total_tokens)}</td><td className="p-3 font-medium">{formatUsd(event.cost_usd)}</td></tr>;
              })}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <Card><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div><span className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</span></CardContent></Card>;
}