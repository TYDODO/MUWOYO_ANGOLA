import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AdminShell from "@/components/AdminShell";
import { supabase } from "@/integrations/supabase/client";

type CustomerRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  total_paid: number;
  last_payment: string | null;
  first_payment: string | null;
  transactions: number;
  status: string | null;
  account_status: string | null;
  province: string | null;
};
type ConfirmedSubscription = { user_id: string; plan_id: string; status: string; confirmed_at: string | null };

const currency = (value: number) => `${Number(value || 0).toLocaleString("pt-AO")} Kz`;

export default function AdminCustomers() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [{ data: profiles, error: profilesError }, { data: subscriptions, error: subscriptionsError }, { data: plans, error: plansError }] = await Promise.all([
        supabase.from("profiles").select("user_id,full_name,email,phone,status,account_status,province"),
        supabase.from("plan_subscriptions").select("user_id,plan_id,status,confirmed_at"),
        supabase.from("subscription_plans").select("id,price_kz"),
      ]);
      const error = profilesError || subscriptionsError || plansError;
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }

      const planPrices = new Map<string, number>((plans || []).map((row) => [row.id, Number(row.price_kz || 0)]));
      const txMap = new Map<string, ConfirmedSubscription[]>();
      (subscriptions || []).forEach((row) => {
        if (!row?.user_id) return;
        if ((row.status === "active" || row.status === "expired") && row.confirmed_at) {
          const bucket = txMap.get(row.user_id) || [];
          bucket.push(row);
          txMap.set(row.user_id, bucket);
        }
      });

      const list = (profiles || [])
        .map((profile) => {
          const txs = txMap.get(profile.user_id) || [];
          const totalPaid = txs.reduce((sum, item) => sum + (planPrices.get(item.plan_id) || 0), 0);
          const dates = txs.map((item) => item.confirmed_at).filter(Boolean).sort();
          return {
            user_id: profile.user_id,
            full_name: profile.full_name,
            email: profile.email,
            phone: profile.phone,
            status: profile.status,
            account_status: profile.account_status,
            province: profile.province,
            total_paid: totalPaid,
            first_payment: dates[0] || null,
            last_payment: dates[dates.length - 1] || null,
            transactions: txs.length,
          } as CustomerRow;
        })
        .filter((row) => row.total_paid > 0)
        .sort((a, b) => b.total_paid - a.total_paid);

      setRows(list);
      setLoadError("");
      setLoading(false);
    })();
  }, [reloadKey]);

  const filteredRows = useMemo(() => {
    if (!query.trim()) return rows;
    const term = query.toLowerCase();
    return rows.filter((row) => `${row.full_name || ""} ${row.email || ""} ${row.phone || ""} ${row.user_id || ""} ${row.province || ""}`.toLowerCase().includes(term));
  }, [rows, query]);

  const totalRevenue = rows.reduce((sum, row) => sum + row.total_paid, 0);
  const avgTicket = rows.length > 0 ? totalRevenue / rows.length : 0;

  return (
    <AdminShell mode="admin" title="Clientes pagantes" search={query} onSearch={setQuery} onRefresh={() => setReloadKey((key) => key + 1)}>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Clientes pagantes" value={rows.length} />
        <Stat label="Valor de tabela estimado" value={currency(totalRevenue)} />
        <Stat label="Média estimada por cliente" value={currency(avgTicket)} />
        <Stat label="Transações" value={rows.reduce((sum, row) => sum + row.transactions, 0)} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Subscrições confirmadas</CardTitle>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}><RefreshCw className="h-4 w-4" />Atualizar</Button>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          {loading ? <p className="p-6 text-sm text-muted-foreground">A carregar clientes pagantes...</p> : loadError ? <p role="alert" className="p-6 text-sm text-destructive">Não foi possível carregar clientes pagantes: {loadError}</p> : filteredRows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nenhum cliente pagante encontrado.</p> : (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3">Cliente</th>
                <th className="p-3">Email</th>
                <th className="p-3">Telefone</th>
                <th className="p-3">Província</th>
                <th className="p-3">1ª compra</th>
                <th className="p-3">Última compra</th>
                <th className="p-3">Transações</th>
                <th className="p-3">Valor de tabela estimado</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.user_id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium">{row.full_name || "Sem nome"}</td>
                  <td className="p-3">{row.email || "—"}</td>
                  <td className="p-3">{row.phone || "—"}</td>
                  <td className="p-3">{row.province || "—"}</td>
                  <td className="p-3">{row.first_payment ? new Date(row.first_payment).toLocaleDateString("pt-AO") : "—"}</td>
                  <td className="p-3">{row.last_payment ? new Date(row.last_payment).toLocaleDateString("pt-AO") : "—"}</td>
                  <td className="p-3">{row.transactions}</td>
                  <td className="p-3 font-semibold">{currency(row.total_paid)}</td>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
