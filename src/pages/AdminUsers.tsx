import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminShell from "@/components/AdminShell";
import { supabase } from "@/integrations/supabase/client";

type UserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  status: string | null;
  account_status: string | null;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  subscription_expires_at: string | null;
  is_suspended: boolean | null;
  onboarding_completed: boolean | null;
  message_limit: number | null;
  messages_received: number | null;
  province: string | null;
  plan_id: string | null;
  role: string;
  connection_state: string | null;
  automation_paused: boolean | null;
  total_paid: number;
  first_purchase: string | null;
  last_purchase: string | null;
  transactions: number;
  has_valid_subscription: boolean;
};

const currency = (value: number) => `${Number(value || 0).toLocaleString("pt-AO")} Kz`;

export default function AdminUsers({ initialStatus = "all" }: { initialStatus?: string }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }, { data: subscriptions, error: subscriptionsError }, { data: instances, error: instancesError }, { data: plans, error: plansError }] = await Promise.all([
        supabase.from("profiles").select("user_id,full_name,email,phone,created_at,status,account_status,trial_started_at,trial_expires_at,subscription_expires_at,is_suspended,onboarding_completed,message_limit,messages_received,province,plan_id"),
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("plan_subscriptions").select("user_id,plan_id,status,confirmed_at,expires_at"),
        supabase.from("instances").select("user_id,status,connection_state,automation_paused"),
        supabase.from("subscription_plans").select("id,price_kz"),
      ]);
      const error = profilesError || rolesError || subscriptionsError || instancesError || plansError;
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }

      const roleMap = new Map((roles || []).map((row) => [row.user_id, row.role]));
      const planPrices = new Map<string, number>((plans || []).map((row) => [row.id, Number(row.price_kz || 0)]));
      const transactionsMap = new Map<string, typeof subscriptions>();
      (subscriptions || []).forEach((row) => {
        const bucket = transactionsMap.get(row.user_id) || [];
        bucket.push(row);
        transactionsMap.set(row.user_id, bucket);
      });
      const instanceMap = new Map((instances || []).map((row) => [row.user_id, row]));

      const now = Date.now();
      const mapped = (profiles || []).map((profile) => {
        const txs = (transactionsMap.get(profile.user_id) || []).filter((item) => (item.status === "active" || item.status === "expired") && item.confirmed_at);
        const hasValidSubscription = (transactionsMap.get(profile.user_id) || []).some((item) => item.status === "active" && (!item.expires_at || new Date(item.expires_at).getTime() > now));
        const totalPaid = txs.reduce((sum, item) => sum + (planPrices.get(item.plan_id) || 0), 0);
        const purchaseDates = txs.map((item) => item.confirmed_at).filter(Boolean).sort();
        const firstPurchase = purchaseDates[0] || null;
        const lastPurchase = purchaseDates[purchaseDates.length - 1] || null;
        const instance = instanceMap.get(profile.user_id) || null;

        return {
          user_id: profile.user_id,
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          created_at: profile.created_at,
          status: profile.status,
          account_status: profile.account_status,
          trial_started_at: profile.trial_started_at,
          trial_expires_at: profile.trial_expires_at,
          subscription_expires_at: profile.subscription_expires_at,
          is_suspended: profile.is_suspended,
          onboarding_completed: profile.onboarding_completed,
          message_limit: Number(profile.message_limit || 0),
          messages_received: Number(profile.messages_received || 0),
          province: profile.province,
          plan_id: profile.plan_id,
          role: roleMap.get(profile.user_id) || "client",
          connection_state: instance?.connection_state || null,
          automation_paused: instance?.automation_paused ?? null,
          total_paid: totalPaid,
          first_purchase: firstPurchase,
          last_purchase: lastPurchase,
          transactions: txs.length,
          has_valid_subscription: hasValidSubscription,
        } as UserRow;
      });

      setRows(mapped);
      setLoadError("");
      setLoading(false);
    })();
  }, [reloadKey]);

  const isOperational = (row: UserRow) => {
    if (row.is_suspended || row.status === "suspended") return false;
    if (row.has_valid_subscription) return true;
    if (row.account_status === "active") return !row.subscription_expires_at || new Date(row.subscription_expires_at).getTime() > Date.now();
    return row.account_status === "trial" && Boolean(row.trial_started_at) && (!row.trial_expires_at || new Date(row.trial_expires_at).getTime() > Date.now());
  };

  const isTrialRunning = (row: UserRow) => row.account_status === "trial" && Boolean(row.trial_started_at) && (!row.trial_expires_at || new Date(row.trial_expires_at).getTime() > Date.now());

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesQuery = `${row.full_name || ""} ${row.email || ""} ${row.phone || ""} ${row.user_id || ""}`.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" ? true : (() => {
        if (statusFilter === "active") return isOperational(row);
        if (statusFilter === "trial") return isTrialRunning(row);
        if (statusFilter === "awaiting_activation") return row.account_status === "awaiting_activation";
        if (statusFilter === "suspended") return Boolean(row.is_suspended || row.status === "suspended");
        if (statusFilter === "inactive") return !row.is_suspended && !isOperational(row) && row.account_status !== "awaiting_activation";
        return true;
      })();
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  return (
    <AdminShell mode="admin" title={initialStatus === "trial" ? "Testes gratuitos" : "Utilizadores"} search={query} onSearch={setQuery} onRefresh={() => setReloadKey((key) => key + 1)}>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Total de utilizadores" value={rows.length} />
        <Stat label="Ativos" value={rows.filter(isOperational).length} />
        <Stat label="Em teste" value={rows.filter((row) => row.account_status === "trial" && Boolean(row.trial_started_at)).length} />
        <Stat label="Pagantes" value={rows.filter((row) => row.total_paid > 0).length} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">Visualização dos utilizadores registados na plataforma.</div>
        <div className="w-full md:max-w-[220px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="trial">Em teste</SelectItem>
              <SelectItem value="awaiting_activation">Aguardando ativação</SelectItem>
              <SelectItem value="suspended">Suspensos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
          <CardHeader>
            <CardTitle>Utilizadores</CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto p-0">
            {loading ? <p className="p-6 text-sm text-muted-foreground">A carregar utilizadores...</p> : loadError ? <p role="alert" className="p-6 text-sm text-destructive">Não foi possível carregar utilizadores: {loadError}</p> : filteredRows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nenhum utilizador encontrado.</p> : (
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3">Nome</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Telefone</th>
                  <th className="p-3">Registo</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Província</th>
                  <th className="p-3">Pagamentos</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.user_id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium">{row.full_name || "Sem nome"}</td>
                    <td className="p-3">{row.email || "—"}</td>
                    <td className="p-3">{row.phone || "—"}</td>
                    <td className="p-3">{row.created_at ? new Date(row.created_at).toLocaleDateString("pt-AO") : "—"}</td>
                    <td className="p-3">{row.is_suspended || row.status === "suspended" ? "Suspenso" : isOperational(row) ? row.account_status === "trial" ? "Em teste" : "Ativo" : row.account_status === "awaiting_activation" ? "Aguardando ativação" : "Inativo"}</td>
                    <td className="p-3">{row.province || "—"}</td>
                    <td className="p-3">{currency(row.total_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </CardContent>
      </Card>
    </AdminShell>
  );
}
function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
