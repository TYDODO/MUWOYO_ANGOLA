import { useEffect, useMemo, useState } from "react";
import { Activity, CirclePause, RefreshCw, Smartphone } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type AutomationRow = {
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  instance_name: string;
  connection_state: string | null;
  status: string;
  automation_paused: boolean;
  updated_at: string;
};

const connectionIsActive = (row: AutomationRow) => row.status === "connected" || row.status === "online" || row.connection_state === "connected";
const formatNumber = (value: number) => Number(value || 0).toLocaleString("pt-AO");

export default function AdminAutomations() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AutomationRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [{ data: instances, error: instancesError }, { data: profiles, error: profilesError }] = await Promise.all([
        supabase.from("instances").select("user_id,instance_name,connection_state,status,automation_paused,updated_at,phone,phone_number"),
        supabase.from("profiles").select("user_id,full_name,email,phone"),
      ]);
      const error = instancesError || profilesError;
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }

      const profileByUser = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
      setRows((instances || []).map((instance) => {
        const profile = profileByUser.get(instance.user_id);
        return {
          user_id: instance.user_id,
          name: profile?.full_name || "Sem nome",
          email: profile?.email || null,
          phone: profile?.phone || instance.phone_number || instance.phone || null,
          instance_name: instance.instance_name,
          connection_state: instance.connection_state,
          status: instance.status,
          automation_paused: instance.automation_paused,
          updated_at: instance.updated_at,
        };
      }));
      setLoadError("");
      setLoading(false);
    })();
  }, [reloadKey]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const term = query.trim().toLocaleLowerCase("pt");
    const matchesQuery = !term || `${row.name} ${row.email || ""} ${row.phone || ""} ${row.instance_name}`.toLocaleLowerCase("pt").includes(term);
    const connected = connectionIsActive(row);
    const matchesFilter = filter === "all" || (filter === "connected" && connected) || (filter === "disconnected" && !connected) || (filter === "paused" && row.automation_paused) || (filter === "operational" && connected && !row.automation_paused);
    return matchesQuery && matchesFilter;
  }), [rows, query, filter]);

  const connected = rows.filter(connectionIsActive).length;
  const paused = rows.filter((row) => row.automation_paused).length;
  const operational = rows.filter((row) => connectionIsActive(row) && !row.automation_paused).length;

  const reconcileEvolution = async () => {
    setReconciling(true);
    const { data, error } = await supabase.functions.invoke("evolution-api", {
      body: { action: "reconcileAllInstances" },
    });
    setReconciling(false);
    if (error || data?.error) {
      const context = error?.context;
      const responseBody = context instanceof Response ? await context.clone().json().catch(() => null) : null;
      toast({ title: "Não foi possível sincronizar", description: responseBody?.error || data?.error || error?.message || "A Evolution não confirmou os estados.", variant: "destructive" });
      return;
    }
    toast({
      title: "Estados sincronizados",
      description: `${data?.checked || 0} instâncias verificadas; ${data?.connected || 0} ligadas e ${data?.disconnected || 0} desligadas.`,
    });
    setReloadKey((key) => key + 1);
  };

  return (
    <AdminShell mode="admin" title="Automações e WhatsApp" description="Estado das instâncias e disponibilidade da automação." search={query} onSearch={setQuery} onRefresh={() => setReloadKey((key) => key + 1)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Instâncias registadas" value={formatNumber(rows.length)} icon={<Smartphone className="h-4 w-4" />} />
        <Stat label="WhatsApp ligados" value={formatNumber(connected)} icon={<Activity className="h-4 w-4" />} />
        <Stat label="Automações pausadas" value={formatNumber(paused)} icon={<CirclePause className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>Estado das instâncias</CardTitle><p className="mt-1 text-sm text-muted-foreground">{formatNumber(operational)} em ligação e com automação operacional.</p></div>
          <div className="flex flex-wrap items-center gap-2"><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="connected">Ligadas</SelectItem><SelectItem value="disconnected">Desligadas</SelectItem><SelectItem value="operational">Operacionais</SelectItem><SelectItem value="paused">Automação pausada</SelectItem></SelectContent></Select><Button type="button" variant="outline" onClick={() => void reconcileEvolution()} disabled={reconciling}><RefreshCw className={`mr-2 h-4 w-4 ${reconciling ? "animate-spin" : ""}`} />{reconciling ? "A verificar..." : "Sincronizar Evolution"}</Button><Button type="button" variant="outline" size="icon" aria-label="Atualizar" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}><RefreshCw className="h-4 w-4" /></Button></div>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          {loading ? <p className="p-6 text-sm text-muted-foreground">A carregar instâncias...</p> : loadError ? <p role="alert" className="p-6 text-sm text-destructive">Não foi possível carregar as instâncias: {loadError}</p> : filteredRows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nenhuma instância encontrada para estes filtros.</p> : (
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Cliente</th><th className="p-3">Telefone</th><th className="p-3">Instância</th><th className="p-3">WhatsApp</th><th className="p-3">Automação</th><th className="p-3">Atualização</th></tr></thead>
              <tbody>{filteredRows.map((row) => <tr key={`${row.user_id}-${row.instance_name}`} className="border-b last:border-0 hover:bg-muted/30"><td className="p-3"><span className="block font-medium">{row.name}</span><span className="text-xs text-muted-foreground">{row.email || row.user_id.slice(0, 8)}</span></td><td className="p-3">{row.phone || "—"}</td><td className="p-3">{row.instance_name}</td><td className="p-3">{row.connection_state || row.status || "Desconhecido"}</td><td className="p-3">{row.automation_paused ? "Pausada" : connectionIsActive(row) ? "Operacional" : "Aguardando ligação"}</td><td className="p-3">{new Date(row.updated_at).toLocaleString("pt-AO")}</td></tr>)}</tbody>
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