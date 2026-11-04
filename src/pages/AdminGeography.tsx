import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Region = {
  province: string;
  users: number;
  activeUsers: number;
  payingUsers: number;
  revenue: number;
};

const formatNumber = (value: number) => Number(value || 0).toLocaleString("pt-AO");
const formatCurrency = (value: number) => `${formatNumber(value)} Kz`;

export default function AdminGeography() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [{ data: profiles, error: profilesError }, { data: subscriptions, error: subscriptionsError }, { data: plans, error: plansError }] = await Promise.all([
        supabase.from("profiles").select("user_id,province,account_status,is_suspended"),
        supabase.from("plan_subscriptions").select("user_id,plan_id,status").eq("status", "active"),
        supabase.from("subscription_plans").select("id,price_kz"),
      ]);

      const error = profilesError || subscriptionsError || plansError;
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }

      const priceByPlan = new Map<string, number>((plans || []).map((plan) => [plan.id, Number(plan.price_kz || 0)]));
      const regionMap = new Map<string, Region>();
      const getRegion = (province: string | null | undefined) => {
        const name = province?.trim() || "Não informado";
        let region = regionMap.get(name);
        if (!region) {
          region = { province: name, users: 0, activeUsers: 0, payingUsers: 0, revenue: 0 };
          regionMap.set(name, region);
        }
        return region;
      };
      const userProvince = new Map<string, string>();

      (profiles || []).forEach((profile) => {
        const province = profile.province?.trim() || "Não informado";
        const region = getRegion(province);
        region.users += 1;
        if (!profile.is_suspended && profile.account_status !== "inactive") region.activeUsers += 1;
        userProvince.set(profile.user_id, province);
      });

      const countedSubscriptions = new Set<string>();
      (subscriptions || []).forEach((subscription) => {
        const province = userProvince.get(subscription.user_id);
        if (!province) return;
        const region = getRegion(province);
        region.revenue += priceByPlan.get(subscription.plan_id) || 0;
        if (!countedSubscriptions.has(subscription.user_id)) {
          region.payingUsers += 1;
          countedSubscriptions.add(subscription.user_id);
        }
      });

      setRegions([...regionMap.values()].sort((a, b) => b.users - a.users || a.province.localeCompare(b.province, "pt")));
      setLoadError("");
      setLoading(false);
    })();
  }, [reloadKey]);

  const filteredRegions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt");
    return term ? regions.filter((region) => region.province.toLocaleLowerCase("pt").includes(term)) : regions;
  }, [regions, query]);
  const totalUsers = regions.reduce((sum, region) => sum + region.users, 0);
  const totalPaying = regions.reduce((sum, region) => sum + region.payingUsers, 0);
  const totalRevenue = regions.reduce((sum, region) => sum + region.revenue, 0);

  return (
    <AdminShell mode="admin" title="Geografia" search={query} onSearch={setQuery} onRefresh={() => setReloadKey((key) => key + 1)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Províncias com utilizadores" value={regions.filter((region) => region.province !== "Não informado").length} />
        <Stat label="Utilizadores registados" value={formatNumber(totalUsers)} />
        <Stat label="Clientes com plano ativo" value={formatNumber(totalPaying)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Distribuição por província</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          {loading ? <p className="p-6 text-sm text-muted-foreground">A carregar dados geográficos...</p> : loadError ? <p role="alert" className="p-6 text-sm text-destructive">Não foi possível carregar os dados geográficos: {loadError}</p> : filteredRegions.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Não há dados para esta pesquisa.</p> : (
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3">Província</th>
                  <th className="p-3">Utilizadores</th>
                  <th className="p-3">Ativos</th>
                  <th className="p-3">Pagantes</th>
                  <th className="p-3">Valor mensal dos planos ativos</th>
                  <th className="p-3">Conversão para plano ativo</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegions.map((region) => (
                  <tr key={region.province} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium">{region.province}</td>
                    <td className="p-3">{formatNumber(region.users)}</td>
                    <td className="p-3">{formatNumber(region.activeUsers)}</td>
                    <td className="p-3">{formatNumber(region.payingUsers)}</td>
                    <td className="p-3">{formatCurrency(region.revenue)}</td>
                    <td className="p-3">{region.users ? `${((region.payingUsers / region.users) * 100).toFixed(1)}%` : "0%"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="p-3">Total</td>
                  <td className="p-3">{formatNumber(totalUsers)}</td>
                  <td className="p-3">{formatNumber(regions.reduce((sum, region) => sum + region.activeUsers, 0))}</td>
                  <td className="p-3">{formatNumber(totalPaying)}</td>
                  <td className="p-3">{formatCurrency(totalRevenue)}</td>
                  <td className="p-3">{totalUsers ? `${((totalPaying / totalUsers) * 100).toFixed(1)}%` : "0%"}</td>
                </tr>
              </tfoot>
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
